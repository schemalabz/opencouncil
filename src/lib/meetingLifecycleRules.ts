import type { AdministrativeBodyType, CouncilMeeting, MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';

/** The columns of a meeting that the lifecycle rules read, as they will be after the write. */
export interface MeetingRecordState {
    id: string;
    administrativeBodyId: string | null;
    dateTime: Date;
    scheduleStatus: MeetingScheduleStatus;
    scheduleStatusReason: string | null;
    kind: MeetingKind | null;
    sessionNumber: number | null;
    format: MeetingFormat;
    postponedFromId: string | null;
    continuationOfId: string | null;
}

/**
 * What the rules need to know about the neighbours of the meeting. The write
 * module loads it in the same transaction as the write. `'missing'` means
 * that the meeting names a link target that does not exist in the city.
 */
export interface LifecycleContext {
    body: { type: AdministrativeBodyType } | null;
    postponedFrom: { administrativeBodyId: string | null; scheduleStatus: MeetingScheduleStatus } | 'missing' | null;
    postponedTo: { administrativeBodyId: string | null } | null;
    /** The walk along postponedFromId, from the new predecessor, reaches this meeting. */
    chainReachesSelf: boolean;
    continuationOf: { administrativeBodyId: string | null; continuationOfId: string | null; dateTime: Date } | 'missing' | null;
    continuations: Array<{ administrativeBodyId: string | null; dateTime: Date }>;
}

export type LifecycleRuleCode =
    | 'councilOnlyKind'
    | 'councilOnlyFormat'
    | 'postponedFromMissing'
    | 'postponedFromNotPostponed'
    | 'postponedFromOtherBody'
    | 'postponedToOtherBody'
    | 'postponementCycle'
    | 'postponedMeetingIsLinked'
    | 'continuationMissing'
    | 'continuationTargetIsPart'
    | 'continuationHasParts'
    | 'continuationOtherBody'
    | 'continuationNotLater'
    | 'continuationOwnsNothing'
    | 'partsOtherBody'
    | 'partsNotLater'
    | 'sessionNumberPositive'
    | 'reasonTooLong'
    | 'chainTooLong'
    | 'laterMeetingReleased'
    | 'hasDependents';

export class LifecycleRuleError extends Error {
    constructor(readonly code: LifecycleRuleCode, message: string) {
        super(message);
        this.name = 'LifecycleRuleError';
    }
}

export const SCHEDULE_STATUS_REASON_MAX_LENGTH = 500;

const COUNCIL_ONLY_KINDS: ReadonlySet<MeetingKind> = new Set(['accountability', 'annualReport']);

/** A meeting with no body reads as the council's everywhere (see meetingsList.ts). */
function isCouncil(body: LifecycleContext['body']): boolean {
    return body === null || body.type === 'council';
}

/**
 * The rules of the meeting record that the database cannot check. Every rule
 * compares the state after the write with the neighbours in both directions,
 * so a change on either end of a link is checked.
 */
export function validateMeetingRecord(next: MeetingRecordState, ctx: LifecycleContext): LifecycleRuleError[] {
    const errors: LifecycleRuleError[] = [];
    const fail = (code: LifecycleRuleCode, message: string) => errors.push(new LifecycleRuleError(code, message));

    if (next.kind && COUNCIL_ONLY_KINDS.has(next.kind) && !isCouncil(ctx.body)) {
        fail('councilOnlyKind', 'Only a council holds a λογοδοσία or an απολογισμός meeting.');
    }
    if (next.format === 'byCirculation' && !isCouncil(ctx.body)) {
        fail('councilOnlyFormat', 'Only a council holds a meeting by circulation.');
    }

    if (next.postponedFromId) {
        if (ctx.postponedFrom === 'missing' || ctx.postponedFrom === null) {
            fail('postponedFromMissing', `The postponed meeting ${next.postponedFromId} does not exist in this city.`);
        } else {
            if (ctx.postponedFrom.scheduleStatus !== 'postponed') {
                fail('postponedFromNotPostponed', 'A new meeting can only follow a meeting whose status is postponed.');
            }
            if (ctx.postponedFrom.administrativeBodyId !== next.administrativeBodyId) {
                fail('postponedFromOtherBody', 'The postponed meeting and its new meeting must belong to the same body.');
            }
            if (ctx.chainReachesSelf) {
                fail('postponementCycle', 'This link would make the postponements a cycle.');
            }
        }
    }
    if (ctx.postponedTo) {
        if (next.scheduleStatus !== 'postponed') {
            fail('postponedMeetingIsLinked', 'This meeting has a new meeting. Remove that link before you change its status.');
        }
        if (ctx.postponedTo.administrativeBodyId !== next.administrativeBodyId) {
            fail('postponedToOtherBody', 'The postponed meeting and its new meeting must belong to the same body.');
        }
    }

    if (next.continuationOfId) {
        if (ctx.continuationOf === 'missing' || ctx.continuationOf === null) {
            fail('continuationMissing', `The first part ${next.continuationOfId} does not exist in this city.`);
        } else {
            if (ctx.continuationOf.continuationOfId !== null) {
                fail('continuationTargetIsPart', 'A later part must point to the first part, not to another later part.');
            }
            if (ctx.continuationOf.administrativeBodyId !== next.administrativeBodyId) {
                fail('continuationOtherBody', 'All the parts of a meeting must belong to the same body.');
            }
            if (next.dateTime.getTime() <= ctx.continuationOf.dateTime.getTime()) {
                fail('continuationNotLater', 'A later part must take place after the first part.');
            }
        }
        if (ctx.continuations.length > 0) {
            fail('continuationHasParts', 'This meeting has later parts, so it cannot be a later part itself.');
        }
        if (next.kind !== null || next.sessionNumber !== null) {
            fail('continuationOwnsNothing', 'A later part has no kind and no session number: the first part holds them.');
        }
    }
    if (ctx.continuations.some((part) => part.administrativeBodyId !== next.administrativeBodyId)) {
        fail('partsOtherBody', 'All the parts of a meeting must belong to the same body.');
    }
    if (ctx.continuations.some((part) => part.dateTime.getTime() <= next.dateTime.getTime())) {
        fail('partsNotLater', 'The first part must take place before its later parts.');
    }

    if (next.sessionNumber !== null && (!Number.isInteger(next.sessionNumber) || next.sessionNumber < 1)) {
        fail('sessionNumberPositive', 'The session number must be a whole number of 1 or more.');
    }
    if ((next.scheduleStatusReason?.length ?? 0) > SCHEDULE_STATUS_REASON_MAX_LENGTH) {
        fail('reasonTooLong', `The reason must be ${SCHEDULE_STATUS_REASON_MAX_LENGTH} characters or fewer.`);
    }

    return errors;
}

/**
 * Why a meeting takes no transcription, or null when it does. A postponed or
 * cancelled meeting did not take place on its date, and a meeting that is
 * closed to the public or held by circulation has no public recording.
 */
export function transcriptionRefusal(meeting: Pick<CouncilMeeting, 'scheduleStatus' | 'closedToPublic' | 'format'>): string | null {
    if (meeting.scheduleStatus !== 'scheduled') return `Meeting is ${meeting.scheduleStatus}`;
    if (meeting.closedToPublic) return 'Meeting is closed to the public: it has no recording to transcribe';
    if (meeting.format === 'byCirculation') return 'Meeting is held by circulation: it has no recording to transcribe';
    return null;
}
