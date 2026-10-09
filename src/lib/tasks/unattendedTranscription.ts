// The cron pass for the recordings of a body whose pipeline runs unattended
// (#829). A secretary pastes the link of a stream before the meeting; the
// meeting write cannot start the transcription then, because the stream has
// not happened. This pass starts it once the meeting is over, for every such
// meeting of the last day and a half that has no transcription yet. A failed
// attempt is retried on the next tick, up to a cap, like the livestream cron.
import "server-only";
import prisma from "@/lib/db/prisma";
import { requestTranscribeInternal } from "./transcribeInternal";
import { PUBLIC_RECORDING_WHERE, TAKES_PLACE_WHERE, UNATTENDED_START_DELAY_MS } from "@/lib/meetingLifecycleRules";
import { SECONDARY_BODY_TYPES, pipelineRunsUnattended } from "@/lib/utils/bodyTier";

const HOUR_MS = 60 * 60 * 1000;
export { UNATTENDED_START_DELAY_MS };
/** How far back the pass looks. A meeting older than this waits for an admin. */
export const UNATTENDED_WINDOW_MS = 36 * HOUR_MS;
/** How many failed attempts the pass makes on one meeting before it stops. */
export const MAX_UNATTENDED_ATTEMPTS = 5;
const MAX_STARTS_PER_RUN = 10;
/** A transcription in one of these states means the meeting needs no start. */
const TRANSCRIBE_ACTIVE_STATUSES = ["pending", "processing", "running", "succeeded"];

export interface UnattendedTranscriptionResult {
    cityId: string;
    meetingId: string;
    action: 'transcribe_triggered' | 'dry_run' | 'exhausted' | 'skipped' | 'error';
    error?: string;
}

export interface UnattendedTranscriptionSummary {
    candidates: number;
    triggered: number;
    exhausted: number;
    errors: number;
    results: UnattendedTranscriptionResult[];
}

export async function transcribeUnattendedMeetings(
    { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<UnattendedTranscriptionSummary> {
    // A meeting whose transcription runs or succeeded is excluded in the query:
    // taken into the window first, such meetings could fill it and keep a
    // later meeting that still needs a start out of every tick.
    const meetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: { gte: new Date(now.getTime() - UNATTENDED_WINDOW_MS), lte: new Date(now.getTime() - UNATTENDED_START_DELAY_MS) },
            youtubeUrl: { not: null },
            administrativeBody: { type: { in: [...SECONDARY_BODY_TYPES] } },
            taskStatuses: { none: { type: 'transcribe', status: { in: TRANSCRIBE_ACTIVE_STATUSES } } },
            ...TAKES_PLACE_WHERE,
            ...PUBLIC_RECORDING_WHERE,
        },
        select: { id: true, cityId: true, youtubeUrl: true, administrativeBody: { select: { type: true } } },
        orderBy: { dateTime: 'asc' },
        take: 50,
    });
    // The where clause names the secondary types; the rule itself decides.
    const unattended = meetings.filter(
        (meeting): meeting is typeof meeting & { youtubeUrl: string } =>
            meeting.youtubeUrl !== null && pipelineRunsUnattended(meeting.administrativeBody),
    );
    const summary: UnattendedTranscriptionSummary = { candidates: 0, triggered: 0, exhausted: 0, errors: 0, results: [] };
    if (unattended.length === 0) return summary;

    const failed = await prisma.taskStatus.findMany({
        where: { councilMeetingId: { in: unattended.map(meeting => meeting.id) }, type: 'transcribe', status: 'failed' },
        select: { councilMeetingId: true, cityId: true },
    });
    const failures = new Map<string, number>();
    for (const task of failed) {
        const key = `${task.cityId}/${task.councilMeetingId}`;
        failures.set(key, (failures.get(key) ?? 0) + 1);
    }

    summary.candidates = unattended.length;

    for (const meeting of unattended) {
        const key = `${meeting.cityId}/${meeting.id}`;
        const base = { cityId: meeting.cityId, meetingId: meeting.id };
        if ((failures.get(key) ?? 0) >= MAX_UNATTENDED_ATTEMPTS) {
            summary.exhausted++;
            summary.results.push({ ...base, action: 'exhausted' });
            continue;
        }
        if (summary.triggered >= MAX_STARTS_PER_RUN) {
            summary.results.push({ ...base, action: 'skipped', error: 'per-run cap reached' });
            continue;
        }
        if (dryRun) {
            summary.triggered++;
            summary.results.push({ ...base, action: 'dry_run' });
            continue;
        }
        try {
            await requestTranscribeInternal(meeting.youtubeUrl, meeting.id, meeting.cityId);
            summary.triggered++;
            summary.results.push({ ...base, action: 'transcribe_triggered' });
        } catch (error) {
            summary.errors++;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[unattendedTranscription] error for ${key}:`, message);
            summary.results.push({ ...base, action: 'error', error: message });
        }
    }
    return summary;
}
