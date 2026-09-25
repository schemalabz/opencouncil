import type { MeetingFormat, MeetingScheduleStatus, Realm } from '@prisma/client';
import { hasExplainPage } from '@/lib/explain/availability';
import {
    msUntilStageChange,
    pendingKind,
    publicMeetingStage,
    type MeetingStageSignals,
    type PendingKind,
    type PublicMeetingStage,
} from '@/lib/meetingStage';

/**
 * What a reader sees for a meeting: its stage (lib/meetingStage.ts), or a
 * fact that replaces the stage. A postponed or cancelled meeting shows that at
 * every age, so it never reads as waiting or as held without material. A
 * meeting that was held with no recording (closed to the public, or by
 * circulation) never promises a video or a transcript.
 */
export type PublicMeetingPresentation =
    | { type: 'postponed'; reason: string | null }
    | { type: 'cancelled'; reason: string | null }
    | { type: 'noRecording'; reason: 'byCirculation' | 'closedToPublic' }
    | { type: 'stage'; stage: PublicMeetingStage };

/** The meeting columns that the presentation reads besides the stage signals. */
export interface MeetingPresentationFields {
    scheduleStatus: MeetingScheduleStatus;
    scheduleStatusReason: string | null;
    format: MeetingFormat;
    closedToPublic: boolean;
}

export function publicMeetingPresentation(
    fields: MeetingPresentationFields,
    signals: MeetingStageSignals,
    now: Date = new Date(),
): PublicMeetingPresentation {
    if (fields.scheduleStatus === 'postponed') return { type: 'postponed', reason: fields.scheduleStatusReason };
    if (fields.scheduleStatus === 'cancelled') return { type: 'cancelled', reason: fields.scheduleStatusReason };

    const stage = publicMeetingStage(signals, now);
    const noRecording = fields.format === 'byCirculation'
        ? 'byCirculation'
        : fields.closedToPublic ? 'closedToPublic' : null;
    // A meeting that has not started reads as upcoming, and a transcript that
    // exists anyway (an admin uploaded the audio) is shown as it is.
    if (noRecording && stage !== 'upcoming' && !signals.transcribed) {
        return { type: 'noRecording', reason: noRecording };
    }
    return { type: 'stage', stage };
}

export type PresentationKey = PublicMeetingStage | 'postponed' | 'cancelled' | 'noRecording';

/** One key per chip, tone and /explain sentence. */
export function presentationKey(presentation: PublicMeetingPresentation): PresentationKey {
    return presentation.type === 'stage' ? presentation.stage : presentation.type;
}

/** Why a piece of the page is empty. Null for the types that promise nothing. */
export function presentationPendingKind(presentation: PublicMeetingPresentation): PendingKind | null {
    return presentation.type === 'stage' ? pendingKind(presentation.stage) : null;
}

/** When the clock alone changes what the page shows. Never, for the types that replace the stage. */
export function msUntilPresentationChange(presentation: PublicMeetingPresentation, dateTime: Date | string, now: Date): number | null {
    return presentation.type === 'stage' ? msUntilStageChange(presentation.stage, dateTime, now) : null;
}

/** Where a chip sends a reader to learn what it means; null where /explain does not exist. */
export function presentationExplainHref(realm: Realm, presentation: PublicMeetingPresentation): string | null {
    return hasExplainPage(realm) ? `/explain#oc-stage-${presentationKey(presentation)}` : null;
}
