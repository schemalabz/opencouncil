import prisma from "../db/prisma";
import { env } from "@/env.mjs";
import { aiChat } from "../ai";
import { resolveChannelId, listRecentChannelVideos, watchUrl, type YouTubeVideo } from "../youtube";
import { parseVideoId } from "@/lib/utils/youtube";
import { getRecentTranscribeFailureErrors } from "@/lib/db/tasksInternal";
import { cacheHas, cacheSetJSON } from "../cache/valkey";
import { requestTranscribeInternal } from "./transcribeInternal";
import { sendLivestreamMatchedAlert, sendLivestreamMultipleMeetingsAlert, sendLivestreamRetriesExhaustedAlert } from "../discord";

/** ±12h around a meeting's scheduled time — the window in which its livestream appears. */
const WINDOW_MS = 12 * 60 * 60 * 1000;
/** Only auto-trigger transcription at/above this match confidence; below → treat as no match. */
const MATCH_CONFIDENCE_THRESHOLD = 0.8;
/** Safety cap on transcriptions triggered per cron invocation. */
const MAX_TRANSCRIBES_PER_RUN = 10;
/** TTL for every "already alerted about this" dedup marker. */
const ALERT_DEDUP_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
/**
 * Automatic attempts allowed per meeting on the same video before we stop and ask for a human.
 * Measured against production history: a budget of 5 covers 93% of the meetings that ever recovered
 * after a failure, and the rest needed a code fix rather than another attempt. Deliberately counts
 * only — permanence is never inferred from the error text, because 15 of the 17 meetings that hit
 * three byte-identical failures in a row went on to succeed.
 */
const MAX_AUTO_TRANSCRIBE_ATTEMPTS = 5;
/** Truncation for failure text carried into the give-up alert, matching pollDecisions. */
const ERROR_PREVIEW_LENGTH = 200;
/** Transcribe statuses that mean "already handled" — anything but a failed attempt. */
const TRANSCRIBE_ACTIVE_STATUSES = new Set(["pending", "processing", "running", "succeeded"]);

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
    action: 'transcribe_triggered' | 'alerted_multiple' | 'alerted_multiple_skipped' | 'alerted_exhausted' | 'alerted_exhausted_skipped' | 'skipped' | 'dry_run' | 'error';
    error?: string;
}

export interface PollLivestreamsSummary {
    candidates: number;
    matched: number;
    multipleMeetings: number;
    exhausted: number;
    skipped: number;
    errors: number;
    dryRun: boolean;
    results: PollLivestreamsMeetingResult[];
}

/**
 * The distinct failure messages behind a meeting's exhausted retry budget, newest first.
 *
 * Scoped to the attempts the budget actually spent, so the alert explains the decision being
 * reported rather than the meeting's whole history. Fetched only when an alert is about to be posted.
 */
async function distinctFailureErrors(cityId: string, councilMeetingId: string): Promise<string[]> {
    const errors = await getRecentTranscribeFailureErrors(cityId, councilMeetingId, MAX_AUTO_TRANSCRIBE_ATTEMPTS);

    const distinct: string[] = [];
    for (const error of errors) {
        const text = error.trim().slice(0, ERROR_PREVIEW_LENGTH);
        if (text && !distinct.includes(text)) distinct.push(text);
    }
    return distinct;
}

/**
 * Finds meetings whose livestream should now exist, matches each to a YouTube video
 * via the LLM, and triggers transcription for confident single-meeting matches.
 *
 * Candidate = processAgenda succeeded, scheduled within ±12h of now, the administrative body
 * has a youtubeChannelUrl, and no transcribe is succeeded or in flight (a failed-only meeting
 * is retried, up to MAX_AUTO_TRANSCRIBE_ATTEMPTS attempts on the same video).
 *
 * Called by the poll-livestreams cron. Pass { dryRun: true } to log decisions without
 * triggering transcription or posting alerts.
 */
export async function pollLivestreamsForRecentMeetings(
    options: { dryRun?: boolean } = {},
): Promise<PollLivestreamsSummary> {
    const dryRun = options.dryRun ?? false;
    const empty: PollLivestreamsSummary = {
        candidates: 0, matched: 0, multipleMeetings: 0, exhausted: 0, skipped: 0, errors: 0, dryRun, results: [],
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
        select: { councilMeetingId: true, cityId: true, type: true, status: true },
    });

    const processAgendaSucceeded = new Set<string>();
    const transcribeActive = new Set<string>();
    const transcribeFailures = new Map<string, number>();
    for (const t of taskStatuses) {
        const key = meetingKey(t.cityId, t.councilMeetingId);
        if (t.type === 'processAgenda' && t.status === 'succeeded') {
            processAgendaSucceeded.add(key);
        }
        if (t.type === 'transcribe' && TRANSCRIBE_ACTIVE_STATUSES.has(t.status)) {
            transcribeActive.add(key);
        }
        if (t.type === 'transcribe' && t.status === 'failed') {
            transcribeFailures.set(key, (transcribeFailures.get(key) ?? 0) + 1);
        }
    }

    // Candidate = processAgenda succeeded AND no transcribe that is succeeded or in flight.
    // A meeting whose only prior transcribe attempts failed is eligible again (auto-retry).
    const candidates = meetings.filter(m => {
        const key = meetingKey(m.cityId, m.id);
        return processAgendaSucceeded.has(key) && !transcribeActive.has(key);
    });

    if (candidates.length === 0) {
        return { ...empty, candidates: 0 };
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

    const results: PollLivestreamsMeetingResult[] = [];
    let matched = 0;
    let multipleMeetings = 0;
    let exhausted = 0;
    let skipped = 0;
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
                const videoUrl = watchUrl(matchedVideo.videoId);
                const attempts = transcribeFailures.get(meetingKey(cityId, meetingId)) ?? 0;

                // Only the video we already burned attempts on is capped. A different video means the
                // council re-uploaded — with working audio, after a silent recording — and that is the
                // one recovery path needing no human, so it always gets a fresh start.
                //
                // Compared by video id: a stored youtu.be link, or a watch URL a human pasted with a
                // timestamp on it, names the same video as watchUrl() without matching it as a string,
                // and reading that as a new upload would hand the same video an unlimited budget.
                const attemptedVideoId = parseVideoId(meeting.youtubeUrl);
                if (attemptedVideoId === matchedVideo.videoId && attempts >= MAX_AUTO_TRANSCRIBE_ATTEMPTS) {
                    exhausted++;
                    const dedupKey = `oc:livestream:exhausted-alert:${cityId}:${meetingId}:${matchedVideo.videoId}`;
                    const base = { cityId, meetingId, decision: 'match' as const, videoId: matchedVideo.videoId, confidence: decision.confidence };

                    if (dryRun) {
                        results.push({ ...base, action: 'dry_run' });
                    } else if (await cacheHas(dedupKey)) {
                        results.push({ ...base, action: 'alerted_exhausted_skipped' });
                    } else {
                        await sendLivestreamRetriesExhaustedAlert({
                            cityId,
                            cityName: meeting.city.name,
                            meetingId,
                            meetingName: meeting.name,
                            videoUrl,
                            videoTitle: matchedVideo.title,
                            attempts,
                            errors: await distinctFailureErrors(cityId, meetingId),
                        });
                        await cacheSetJSON(dedupKey, 1, ALERT_DEDUP_TTL_SECONDS);
                        results.push({ ...base, action: 'alerted_exhausted' });
                    }
                    continue;
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

                await requestTranscribeInternal(videoUrl, meetingId, cityId);
                transcribesTriggered++;
                matched++;

                // One announcement per video, not one per retry: without this a meeting that keeps
                // failing re-posts the same "matched" alert on every poll tick.
                //
                // Both awaited, so the marker is written before the cron request can return — a
                // detached write can be dropped when the runtime freezes, and a lost marker means
                // the duplicate alerts this key exists to prevent. Nothing is given up by blocking:
                // the webhook transport logs HTTP and network failures without rejecting, so there
                // is no delivery signal a non-blocking send could have acted on anyway.
                const matchedAlertKey = `oc:livestream:matched-alert:${cityId}:${meetingId}:${matchedVideo.videoId}`;
                if (!(await cacheHas(matchedAlertKey))) {
                    await sendLivestreamMatchedAlert({
                        cityId,
                        cityName: meeting.city.name,
                        meetingId,
                        meetingName: meeting.name,
                        videoUrl,
                        videoTitle: matchedVideo.title,
                        confidence: decision.confidence,
                        reasoning: decision.reasoning,
                    }).catch(err => console.error('[pollLivestreams] matched alert failed:', err));
                    await cacheSetJSON(matchedAlertKey, 1, ALERT_DEDUP_TTL_SECONDS);
                }

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
                    // Marked once the send has settled. Note this is not proof of delivery: the
                    // webhook transport logs an HTTP or network failure without rejecting, so a
                    // dropped alert still suppresses its repeats for the marker's lifetime.
                    await cacheSetJSON(dedupKey, 1, ALERT_DEDUP_TTL_SECONDS);
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
        exhausted,
        skipped,
        errors,
        dryRun,
        results,
    };
}
