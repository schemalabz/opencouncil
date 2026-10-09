import type { MeetingScheduleStatus, Realm } from '@prisma/client';
import { hasExplainPage } from '@/lib/explain/availability';
import { hasPublicRecording, type RecordingFields } from '@/lib/meetingLifecycleRules';
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
 * meeting held by circulation, or one that the body marked as not recorded
 * (#829), has no recording, so it never promises a video or a transcript.
 */
export type PublicMeetingPresentation =
    | { type: 'postponed'; reason: string | null }
    | { type: 'cancelled'; reason: string | null }
    | { type: 'noRecording'; reason: 'byCirculation' | 'notRecorded' }
    | { type: 'stage'; stage: PublicMeetingStage };

/** The meeting columns that the presentation reads besides the stage signals. */
export interface MeetingPresentationFields extends RecordingFields {
    scheduleStatus: MeetingScheduleStatus;
    scheduleStatusReason: string | null;
}

export function publicMeetingPresentation(
    fields: MeetingPresentationFields,
    signals: MeetingStageSignals,
    now: Date = new Date(),
): PublicMeetingPresentation {
    switch (fields.scheduleStatus) {
        case 'postponed': return { type: 'postponed', reason: fields.scheduleStatusReason };
        case 'cancelled': return { type: 'cancelled', reason: fields.scheduleStatusReason };
        case 'scheduled': break;
        default: {
            const unhandled: never = fields.scheduleStatus;
            throw new Error(`Unhandled schedule status ${unhandled}`);
        }
    }

    const stage = publicMeetingStage(signals, now);
    // A meeting that has not started reads as upcoming; the strip offers it no
    // channel. Once it starts, it never promises a video or a transcript.
    if (!hasPublicRecording(fields) && stage !== 'upcoming') {
        return { type: 'noRecording', reason: fields.noRecording ? 'notRecorded' : 'byCirculation' };
    }
    return { type: 'stage', stage };
}

/**
 * Every chip key: the stages, then the types that replace the stage.
 * `presentationKey` returns a stage or a type, so a new one fails to compile
 * until it is listed here, and the translation test then asks for its label.
 */
export const PRESENTATION_KEYS = [
    'upcoming', 'live', 'waiting', 'transcribing', 'review', 'complete', 'archive',
    'postponed', 'cancelled', 'noRecording',
] as const;

export type PresentationKey = (typeof PRESENTATION_KEYS)[number];

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
