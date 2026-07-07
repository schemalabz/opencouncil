import prisma from "../db/prisma";
import { env } from "@/env.mjs";
import { aiChat } from "../ai";
import { resolveChannelId, listRecentChannelVideos, watchUrl, type YouTubeVideo } from "../youtube";
import { cacheHas, cacheSetJSON } from "../cache/valkey";
import { requestTranscribeInternal } from "./transcribeInternal";
import { sendLivestreamMatchedAlert, sendLivestreamMultipleMeetingsAlert } from "../discord";

/** ±12h around a meeting's scheduled time — the window in which its livestream appears. */
const WINDOW_MS = 12 * 60 * 60 * 1000;
/** Only auto-trigger transcription at/above this match confidence; below → treat as no match. */
const MATCH_CONFIDENCE_THRESHOLD = 0.8;
/** Safety cap on transcriptions triggered per cron invocation. */
const MAX_TRANSCRIBES_PER_RUN = 10;
/** TTL for the "already alerted about a multi-meeting stream" dedup marker. */
const MULTI_ALERT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
/** Transcribe statuses that mean "already handled" — anything but a failed attempt. */
const TRANSCRIBE_ACTIVE_STATUSES = new Set(["pending", "processing", "running", "succeeded"]);
/**
 * Grace period after a livestream ends before we transcribe it. A just-ended stream's
 * archived VOD is still being processed by YouTube for a while (roughly 30–60 min for a
 * long council meeting) and can't be reliably downloaded yet, so we wait it out.
 */
const GRACE_MS = 35 * 60 * 1000;
/**
 * Minimum wait between transcribe retries for a meeting whose previous attempts failed.
 * The backend fails a partial download (VOD still processing), and this backoff spaces the
 * retries out instead of hammering every 10-min cron run.
 */
const RETRY_BACKOFF_MS = 30 * 60 * 1000;
/**
 * Give up auto-transcribing a meeting after this many failed attempts. With RETRY_BACKOFF_MS
 * this covers several hours of retries — well past normal VOD processing — after which a
 * persistent failure is a different problem (handled manually), not a still-processing VOD.
 */
const MAX_TRANSCRIBE_ATTEMPTS = 8;
/**
 * Prefix the backend puts on the error when it rejects a partial download of a
 * still-processing VOD. Only these failures drive the backoff/cap — other failures
 * retry on the normal cadence. Keep in sync with the backend (opencouncil-tasks pipeline).
 */
const INCOMPLETE_RECORDING_MARKER = 'INCOMPLETE_RECORDING';

function meetingKey(cityId: string, meetingId: string): string {
    return `${cityId}:${meetingId}`;
}

/**
 * The matcher's structured verdict. `multiple_meetings` is a deliberate refusal:
 * the best candidate appears to cover more than one council meeting (e.g. a combined
 * λογοδοσία + τακτική συνεδρίαση stream), which we never auto-match.
 */
export interface LivestreamMatchDecision {
    decision: 'match' | 'no_match' | 'multiple_meetings';
    videoId?: string;
    confidence: number;
    reasoning: string;
}

const MATCH_SYSTEM_PROMPT = `You match a Greek municipal council meeting to its livestream video on the body's official YouTube channel.

You are given one meeting (title, scheduled date/time, administrative body, agenda subjects) and a list of recent videos from the channel (id, title, publish date).

Decide which single video IS the recording/livestream of THIS specific meeting, and return ONLY a JSON object:
{
  "decision": "match" | "no_match" | "multiple_meetings",
  "videoId": "<the matching video id, only when decision is 'match'>",
  "confidence": <number 0..1>,
  "reasoning": "<one or two sentences>"
}

Rules:
- "match": exactly one video clearly corresponds to this meeting (title and date align). Set videoId and a confidence reflecting certainty.
- "no_match": no video corresponds to this meeting (it may not be uploaded yet). Use this when unsure rather than guessing.
- "multiple_meetings": the best-matching video appears to cover MORE THAN ONE council meeting in a single stream (e.g. a "Λογοδοσία" special session combined with a "Τακτική Συνεδρίαση", or two numbered sessions in one title). Do NOT pick such a video as a match — these are handled manually. Set videoId to the offending video and explain.
- Greek council titles often include a session number and a date (e.g. "21η Τακτική Συνεδρίαση 10/06/2026"). Use both the title and the publish date to judge alignment.
- Return strictly valid JSON, no markdown, no extra text.`;

/**
 * Asks the LLM to match a meeting to one of the channel's recent videos.
 * Returns a structured decision, including the multi-meeting refusal case.
 */
export async function matchMeetingToVideo(
    meeting: {
        name: string;
        name_en: string;
        dateTime: Date;
        administrativeBodyName: string;
        subjectNames: string[];
    },
    videos: YouTubeVideo[],
): Promise<LivestreamMatchDecision> {
    if (videos.length === 0) {
        return { decision: 'no_match', confidence: 1, reasoning: 'No recent videos on the channel.' };
    }

    const userPrompt = JSON.stringify({
        meeting: {
            title: meeting.name,
            title_en: meeting.name_en,
            scheduledAt: meeting.dateTime.toISOString(),
            administrativeBody: meeting.administrativeBodyName,
            agendaSubjects: meeting.subjectNames.slice(0, 20),
        },
        candidateVideos: videos.map(v => ({
            videoId: v.videoId,
            title: v.title,
            publishedAt: v.publishedAt,
        })),
    }, null, 2);

    const { result } = await aiChat<LivestreamMatchDecision>(
        MATCH_SYSTEM_PROMPT,
        userPrompt,
        undefined,
        undefined,
        { maxTokens: 500 },
    );

    return result;
}

export interface PollLivestreamsMeetingResult {
    cityId: string;
    meetingId: string;
    decision: LivestreamMatchDecision['decision'] | 'error';
    videoId?: string;
    confidence?: number;
    action: 'transcribe_triggered' | 'alerted_multiple' | 'alerted_multiple_skipped' | 'skipped' | 'gave_up' | 'dry_run' | 'error';
    error?: string;
}

export interface PollLivestreamsSummary {
    candidates: number;
    matched: number;
    multipleMeetings: number;
    skipped: number;
    errors: number;
    dryRun: boolean;
    results: PollLivestreamsMeetingResult[];
}

/**
 * Finds meetings whose livestream should now exist, matches each to a YouTube video
 * via the LLM, and triggers transcription for confident single-meeting matches.
 *
 * Candidate = processAgenda succeeded, scheduled within ±12h of now, the administrative body
 * has a youtubeChannelUrl, and no transcribe is succeeded or in flight (a failed-only meeting
 * is retried).
 *
 * Called by the poll-livestreams cron. Pass { dryRun: true } to log decisions without
 * triggering transcription or posting alerts.
 */
export async function pollLivestreamsForRecentMeetings(
    options: { dryRun?: boolean } = {},
): Promise<PollLivestreamsSummary> {
    const dryRun = options.dryRun ?? false;
    const empty: PollLivestreamsSummary = {
        candidates: 0, matched: 0, multipleMeetings: 0, skipped: 0, errors: 0, dryRun, results: [],
    };

    if (!env.YOUTUBE_API_KEY) {
        console.log('[pollLivestreams] YOUTUBE_API_KEY not configured — skipping');
        return empty;
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    const windowEnd = new Date(now.getTime() + WINDOW_MS);

    // Note: candidacy is NOT gated on `youtubeUrl: null`. requestTranscribeInternal writes
    // youtubeUrl before startTask, so a failed/never-started transcribe would otherwise leave
    // the meeting with a non-null youtubeUrl and permanently excluded. Instead we gate on the
    // transcribe task status below (retry on failed, skip on succeeded/in-flight).
    const meetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: { gte: windowStart, lte: windowEnd },
            administrativeBody: { youtubeChannelUrl: { not: null } },
        },
        include: {
            administrativeBody: true,
            city: { select: { name: true } },
            subjects: { select: { name: true }, orderBy: { agendaItemIndex: 'asc' } },
        },
        orderBy: { dateTime: 'desc' },
        take: 50,
    });

    if (meetings.length === 0) return empty;

    // Batch-fetch processAgenda + transcribe task history for all candidates in one query.
    const meetingIds = meetings.map(m => m.id);
    const taskStatuses = await prisma.taskStatus.findMany({
        where: {
            councilMeetingId: { in: meetingIds },
            type: { in: ['processAgenda', 'transcribe'] },
        },
        select: { councilMeetingId: true, cityId: true, type: true, status: true, updatedAt: true, responseBody: true },
    });

    const processAgendaSucceeded = new Set<string>();
    const transcribeActive = new Set<string>();
    // Per meeting: how many transcribe attempts failed because the download was an
    // incomplete recording (VOD still processing), and when the latest one failed.
    // Drives the retry backoff and give-up cap. Only these failures count — a failure
    // for any other reason (manual transcribe, transient backend/network error) neither
    // consumes the cap nor triggers the backoff, so it retries on the normal poll cadence.
    const failedTranscribe = new Map<string, { count: number; latestFailedAt: Date }>();
    for (const t of taskStatuses) {
        const key = meetingKey(t.cityId, t.councilMeetingId);
        if (t.type === 'processAgenda' && t.status === 'succeeded') {
            processAgendaSucceeded.add(key);
        }
        if (t.type === 'transcribe' && TRANSCRIBE_ACTIVE_STATUSES.has(t.status)) {
            transcribeActive.add(key);
        }
        if (t.type === 'transcribe' && t.status === 'failed' && (t.responseBody ?? '').includes(INCOMPLETE_RECORDING_MARKER)) {
            const cur = failedTranscribe.get(key);
            if (!cur) {
                failedTranscribe.set(key, { count: 1, latestFailedAt: t.updatedAt });
            } else {
                cur.count += 1;
                if (t.updatedAt > cur.latestFailedAt) cur.latestFailedAt = t.updatedAt;
            }
        }
    }

    // Candidate = processAgenda succeeded AND no transcribe that is succeeded or in flight.
    // A meeting whose only prior transcribe attempts failed is eligible again (auto-retry),
    // but only after the backoff window and up to the attempt cap.
    // Meetings that hit the cap are surfaced (not silently dropped) so a persistent failure
    // is operator-visible in the poll summary rather than just a log line.
    const gaveUp: PollLivestreamsMeetingResult[] = [];
    const candidates = meetings.filter(m => {
        const key = meetingKey(m.cityId, m.id);
        if (!processAgendaSucceeded.has(key) || transcribeActive.has(key)) return false;

        const failed = failedTranscribe.get(key);
        if (failed) {
            if (failed.count >= MAX_TRANSCRIBE_ATTEMPTS) {
                console.warn(`[pollLivestreams] ${key}: ${failed.count} failed transcribe attempts, giving up (cap reached)`);
                gaveUp.push({ cityId: m.cityId, meetingId: m.id, decision: 'no_match', action: 'gave_up', error: `gave up after ${failed.count} failed transcribe attempts` });
                return false;
            }
            if (now.getTime() - failed.latestFailedAt.getTime() < RETRY_BACKOFF_MS) {
                return false; // still within retry backoff
            }
        }
        return true;
    });

    if (candidates.length === 0) {
        return { ...empty, candidates: 0, skipped: gaveUp.length, results: gaveUp };
    }

    // Resolve + list videos once per distinct channel (quota-friendly).
    const channelVideos = new Map<string, YouTubeVideo[]>();
    const channelErrors = new Map<string, string>();
    async function getChannelVideos(channelUrl: string): Promise<YouTubeVideo[]> {
        if (channelVideos.has(channelUrl)) return channelVideos.get(channelUrl)!;
        if (channelErrors.has(channelUrl)) throw new Error(channelErrors.get(channelUrl)!);
        try {
            const channelId = await resolveChannelId(channelUrl);
            if (!channelId) throw new Error(`Could not resolve channel id from ${channelUrl}`);
            const videos = await listRecentChannelVideos(channelId);
            channelVideos.set(channelUrl, videos);
            return videos;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            channelErrors.set(channelUrl, msg);
            throw error;
        }
    }

    const results: PollLivestreamsMeetingResult[] = [...gaveUp];
    let matched = 0;
    let multipleMeetings = 0;
    let skipped = gaveUp.length;
    let errors = 0;
    let transcribesTriggered = 0;

    for (const meeting of candidates) {
        const cityId = meeting.cityId;
        const meetingId = meeting.id;
        const channelUrl = meeting.administrativeBody!.youtubeChannelUrl!;

        try {
            const videos = await getChannelVideos(channelUrl);
            const decision = await matchMeetingToVideo(
                {
                    name: meeting.name,
                    name_en: meeting.name_en,
                    dateTime: meeting.dateTime,
                    administrativeBodyName: meeting.administrativeBody!.name,
                    subjectNames: meeting.subjects.map(s => s.name),
                },
                videos,
            );

            // Guard: only honor a videoId the channel actually returned.
            const matchedVideo = decision.videoId
                ? videos.find(v => v.videoId === decision.videoId)
                : undefined;

            if (
                decision.decision === 'match' &&
                matchedVideo &&
                decision.confidence >= MATCH_CONFIDENCE_THRESHOLD
            ) {
                // Grace period: a just-ended stream's VOD may still be processing and not
                // yet downloadable. Wait until it's been ended a while before transcribing.
                // (A normal upload has no actualEndTime and is never delayed.)
                if (matchedVideo.actualEndTime) {
                    const endedMsAgo = now.getTime() - new Date(matchedVideo.actualEndTime).getTime();
                    if (endedMsAgo < GRACE_MS) {
                        skipped++;
                        results.push({ cityId, meetingId, decision: 'match', videoId: matchedVideo.videoId, confidence: decision.confidence, action: 'skipped', error: 'within grace period (VOD may still be processing)' });
                        continue;
                    }
                }

                if (transcribesTriggered >= MAX_TRANSCRIBES_PER_RUN) {
                    skipped++;
                    results.push({ cityId, meetingId, decision: 'match', videoId: matchedVideo.videoId, confidence: decision.confidence, action: 'skipped', error: 'per-run cap reached' });
                    continue;
                }

                if (dryRun) {
                    results.push({ cityId, meetingId, decision: 'match', videoId: matchedVideo.videoId, confidence: decision.confidence, action: 'dry_run' });
                    matched++;
                    continue;
                }

                // Expected recording length from the livestream's wall-clock, so the backend
                // can reject a partial download of a still-processing VOD. Undefined for a
                // normal upload (no live timing) — then the backend skips the check. In the
                // rare case a finished stream reports actualEndTime but not actualStartTime,
                // we can't compute a length; the 35-min grace period is the fallback guard.
                const expectedDurationSeconds =
                    matchedVideo.actualStartTime && matchedVideo.actualEndTime
                        ? Math.max(0, (new Date(matchedVideo.actualEndTime).getTime() - new Date(matchedVideo.actualStartTime).getTime()) / 1000)
                        : undefined;

                const videoUrl = watchUrl(matchedVideo.videoId);
                await requestTranscribeInternal(videoUrl, meetingId, cityId, { expectedDurationSeconds });
                transcribesTriggered++;
                matched++;
                sendLivestreamMatchedAlert({
                    cityId,
                    cityName: meeting.city.name,
                    meetingId,
                    meetingName: meeting.name,
                    videoUrl,
                    videoTitle: matchedVideo.title,
                    confidence: decision.confidence,
                    reasoning: decision.reasoning,
                }).catch(err => console.error('[pollLivestreams] matched alert failed:', err));

                results.push({ cityId, meetingId, decision: 'match', videoId: matchedVideo.videoId, confidence: decision.confidence, action: 'transcribe_triggered' });
            } else if (decision.decision === 'multiple_meetings') {
                multipleMeetings++;
                const dedupKey = `oc:livestream:multi-alert:${cityId}:${meetingId}`;
                const alreadyAlerted = await cacheHas(dedupKey);

                if (dryRun) {
                    results.push({ cityId, meetingId, decision: 'multiple_meetings', videoId: decision.videoId, action: 'dry_run' });
                } else if (alreadyAlerted) {
                    results.push({ cityId, meetingId, decision: 'multiple_meetings', videoId: decision.videoId, action: 'alerted_multiple_skipped' });
                } else {
                    const videoUrl = matchedVideo ? watchUrl(matchedVideo.videoId) : undefined;
                    await sendLivestreamMultipleMeetingsAlert({
                        cityId,
                        cityName: meeting.city.name,
                        meetingId,
                        meetingName: meeting.name,
                        channelUrl,
                        videoUrl,
                        reasoning: decision.reasoning,
                    });
                    // Set the dedup marker only after a successful alert.
                    await cacheSetJSON(dedupKey, 1, MULTI_ALERT_TTL_SECONDS);
                    results.push({ cityId, meetingId, decision: 'multiple_meetings', videoId: decision.videoId, action: 'alerted_multiple' });
                }
            } else {
                // no_match, or a match below the confidence threshold → retry next run.
                skipped++;
                results.push({ cityId, meetingId, decision: decision.decision, confidence: decision.confidence, action: 'skipped' });
            }
        } catch (error) {
            errors++;
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[pollLivestreams] error for ${cityId}/${meetingId}:`, msg);
            results.push({ cityId, meetingId, decision: 'error', action: 'error', error: msg });
        }
    }

    return {
        candidates: candidates.length,
        matched,
        multipleMeetings,
        skipped,
        errors,
        dryRun,
        results,
    };
}
