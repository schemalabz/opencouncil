import type { Realm } from '@prisma/client';
import type { MeetingTaskStatus } from '@/lib/db/tasks';
import { hasExplainPage } from '@/lib/explain/availability';

/**
 * The public life of a meeting, as the reader sees it: the same seven words on
 * the meeting page, the list cards, the city timeline and the city rail. The
 * admin pipeline (lib/meetingStatus.ts) tracks tasks; this tracks promises —
 * what the page has now and what it says is coming.
 */
export type PublicMeetingStage = 'upcoming' | 'live' | 'waiting' | 'transcribing' | 'review' | 'complete' | 'archive';
export const PUBLIC_MEETING_STAGES: readonly PublicMeetingStage[] = ['upcoming', 'live', 'waiting', 'transcribing', 'review', 'complete', 'archive'];

/** The four facts a stage is read from. Every surface derives them from what it has. */
export interface MeetingStageSignals {
    dateTime: Date | string;
    /** A recording or a stream is known: a YouTube URL, an upload, or a Mux asset. */
    hasMedia: boolean;
    /** A transcript exists: the transcribe task succeeded, or segments are present. */
    transcribed: boolean;
    /** Summaries exist: the summarize task succeeded, or subjects carry contributions. */
    summarized: boolean;
}

const HOUR = 60 * 60 * 1000;
/** After the meeting starts, how long it reads as "in progress" while no transcript exists. */
export const LIVE_WINDOW_MS = 12 * HOUR;
/** How long the page keeps promising a video, or a review, before it stops promising. */
export const PROMISE_WINDOW_MS = 7 * 24 * HOUR;
/** When the summaries are promised for: 48 hours after the meeting starts. */
export const REVIEW_PROMISE_MS = 48 * HOUR;

export function publicMeetingStage(signals: MeetingStageSignals, now: Date = new Date()): PublicMeetingStage {
    const age = now.getTime() - new Date(signals.dateTime).getTime();
    if (age < 0) return 'upcoming';
    if (signals.transcribed) {
        // A transcript that has gone a week without summaries is not under
        // review any more — older imports never ran summarize — so the page
        // stops promising and shows what it has.
        return signals.summarized || age >= PROMISE_WINDOW_MS ? 'complete' : 'review';
    }
    if (age < LIVE_WINDOW_MS) return 'live';
    if (age >= PROMISE_WINDOW_MS) return 'archive';
    return signals.hasMedia ? 'transcribing' : 'waiting';
}

/** Why a piece of the page is empty: the meeting is ahead, its transcript is on its way, or it is under review. */
export type PendingKind = 'before' | 'processing' | 'review';

/** Null once the meeting is complete or archived: then an empty piece is simply empty. */
export function pendingKind(stage: PublicMeetingStage): PendingKind | null {
    switch (stage) {
        case 'upcoming':
        case 'live':
            return 'before';
        case 'waiting':
        case 'transcribing':
            return 'processing';
        case 'review':
            return 'review';
        default:
            return null;
    }
}

/**
 * How long until the clock alone changes what a page shows for this stage:
 * the next boundary, or a minute while a relative time is on screen. Null
 * once nothing can change without new data — a complete meeting never ticks.
 */
export function msUntilStageChange(stage: PublicMeetingStage, dateTime: Date | string, now: Date): number | null {
    const elapsed = now.getTime() - new Date(dateTime).getTime();
    const until = (boundary: number) => Math.max(1_000, boundary - elapsed);
    switch (stage) {
        case 'upcoming':
            return Math.min(60_000, until(0));
        case 'live':
            return until(LIVE_WINDOW_MS);
        case 'waiting':
        case 'transcribing':
            return until(PROMISE_WINDOW_MS);
        case 'review':
            return elapsed < REVIEW_PROMISE_MS ? until(REVIEW_PROMISE_MS) : until(PROMISE_WINDOW_MS);
        default:
            return null;
    }
}

/** The deadline the review stage promises. Null once it has passed: the copy says "soon" instead of an expired date. */
export function reviewDeadline(dateTime: Date | string, now: Date = new Date()): Date | null {
    const deadline = new Date(new Date(dateTime).getTime() + REVIEW_PROMISE_MS);
    return deadline.getTime() > now.getTime() ? deadline : null;
}

export interface MeetingMediaFields {
    youtubeUrl: string | null;
    videoUrl: string | null;
    audioUrl: string | null;
    muxPlaybackId: string | null;
}

export function hasMeetingMedia(meeting: MeetingMediaFields): boolean {
    return Boolean(meeting.youtubeUrl || meeting.videoUrl || meeting.audioUrl || meeting.muxPlaybackId);
}

/** Signals from the meeting page's data: the meeting row, the succeeded tasks, and what the page holds. */
export function stageSignalsFromMeetingData(
    meeting: MeetingMediaFields & { dateTime: Date | string },
    tasks: Pick<MeetingTaskStatus, 'transcribe' | 'summarize'>,
    onHand: { segmentCount: number; contributionCount: number },
): MeetingStageSignals {
    return {
        dateTime: meeting.dateTime,
        hasMedia: hasMeetingMedia(meeting),
        transcribed: tasks.transcribe || onHand.segmentCount > 0,
        summarized: tasks.summarize || onHand.contributionCount > 0,
    };
}

/** What a list projection (meetingWithSubjectPreviewInclude) carries for the stage. */
export interface MeetingStagePreview extends MeetingMediaFields {
    dateTime: Date | string;
    taskStatuses: { type: string }[];
    _count: { speakerSegments: number };
    subjects: { _count: { contributions: number } }[];
}

export function stageSignalsFromPreview(meeting: MeetingStagePreview): MeetingStageSignals {
    const succeeded = new Set(meeting.taskStatuses.map(task => task.type));
    return {
        dateTime: meeting.dateTime,
        hasMedia: hasMeetingMedia(meeting),
        transcribed: succeeded.has('transcribe') || meeting._count.speakerSegments > 0,
        summarized: succeeded.has('summarize') || meeting.subjects.some(subject => subject._count.contributions > 0),
    };
}

/** Where a chip or a strip sends a reader to learn what its stage means; null where /explain does not exist. */
export function meetingStageExplainHref(realm: Realm, stage: PublicMeetingStage): string | null {
    return hasExplainPage(realm) ? `/explain#oc-stage-${stage}` : null;
}
