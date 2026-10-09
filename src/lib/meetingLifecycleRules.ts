import type { AdministrativeBodyType, CouncilMeeting, MeetingFormat, MeetingKind, MeetingScheduleStatus, Prisma } from '@prisma/client';

/** The columns of a meeting that the lifecycle rules read, as they will be after the write. */
export interface MeetingRecordState {
    id: string;
    administrativeBodyId: string | null;
    dateTime: Date;
    scheduleStatus: MeetingScheduleStatus;
    scheduleStatusReason: string | null;
    kind: MeetingKind | null;
    sessionNumber: number | null;
    format: MeetingFormat | null;
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
    postponedFrom: { administrativeBodyId: string | null; scheduleStatus: MeetingScheduleStatus; dateTime: Date } | 'missing' | null;
    /** Another meeting is already the new meeting of the postponed meeting. */
    postponedFromTaken: boolean;
    postponedTo: { administrativeBodyId: string | null } | null;
    /** The walk along postponedFromId, from the new predecessor, reaches this meeting. */
    chainReachesSelf: boolean;
    continuationOf: { administrativeBodyId: string | null; continuationOfId: string | null; dateTime: Date } | 'missing' | null;
    continuations: Array<{ administrativeBodyId: string | null; dateTime: Date }>;
}

export type LifecycleRuleCode =
    | 'councilOnlyKind'
    | 'postponedFromMissing'
    | 'postponedFromNotPostponed'
    | 'postponedFromTaken'
    | 'postponedFromOtherBody'
    | 'postponedToEarlier'
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

/** How long a pasted agenda may be. A long agenda of a council runs to a few thousand characters. */
export const AGENDA_TEXT_MAX_LENGTH = 40_000;

/**
 * The facts of the record that a write sets besides the links, in one list:
 * the meeting writes and the MCP tools read it, so a new fact reaches both.
 */
export const MEETING_RECORD_INPUT_KEYS = [
    'kind', 'sessionNumber', 'scheduleStatus', 'scheduleStatusReason', 'format', 'closedToPublic', 'noRecording', 'place',
] as const satisfies ReadonlyArray<keyof CouncilMeeting>;

export type MeetingRecordInput = Partial<Pick<CouncilMeeting, (typeof MEETING_RECORD_INPUT_KEYS)[number]>>;

/** The record facts of a request, without the keys that it left out. */
export function pickRecordInput(input: MeetingRecordInput): MeetingRecordInput {
    return Object.fromEntries(
        MEETING_RECORD_INPUT_KEYS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
    ) as MeetingRecordInput;
}

/**
 * One stated meaning for each value of the lifecycle enums. Every consumer
 * reads these tables (or a helper below), so a new value fails to compile
 * here instead of changing behaviour in silence where a raw value is tested.
 */
export const SCHEDULE_STATUSES = {
    scheduled: { takesPlace: true },
    postponed: { takesPlace: false },
    cancelled: { takesPlace: false },
} as const satisfies Record<MeetingScheduleStatus, { takesPlace: boolean }>;

export const MEETING_FORMATS = {
    inPerson: { publicRecording: true, showsPlace: true, namedInFacts: false, offeredInForm: true },
    remote: { publicRecording: true, showsPlace: false, namedInFacts: true, offeredInForm: true },
    hybrid: { publicRecording: true, showsPlace: true, namedInFacts: true, offeredInForm: true },
    // Offered in no form yet: the by-circulation page is a follow-up.
    byCirculation: { publicRecording: false, showsPlace: false, namedInFacts: false, offeredInForm: false },
} as const satisfies Record<MeetingFormat, FormatRules & { offeredInForm: boolean }>;

/**
 * A null format: nobody has stated it yet, and the meeting is expected as
 * usual. It has a recording, it shows the hall of its body, and the facts
 * row does not name it. processAgenda reads the format from the invitation.
 */
export const UNSTATED_FORMAT = {
    publicRecording: true, showsPlace: true, namedInFacts: false,
} as const satisfies FormatRules;

/** The rules of a format, stated or not. Every reader of a format asks this. */
export function formatRules(format: MeetingFormat | null): FormatRules {
    return format === null ? UNSTATED_FORMAT : MEETING_FORMATS[format];
}

interface FormatRules {
    /** The meeting can have a stream and a transcript. */
    publicRecording: boolean;
    /** The meeting page shows where the meeting takes place. */
    showsPlace: boolean;
    /** The facts row of the meeting page names the format (meetingStage.facts.format). */
    namedInFacts: boolean;
}

/**
 * A null kind means that the record states no single kind. There are three
 * cases: the invitation is not read yet; the record holds several meetings,
 * and its name override says which; or the meeting is none of these kinds,
 * such as the financial accounts (515–518). A null kind takes decisions and
 * is not council-only.
 */
export const MEETING_KINDS = {
    regular: { councilOnly: false, takesDecisions: true },
    urgent: { councilOnly: false, takesDecisions: true },
    accountability: { councilOnly: true, takesDecisions: false },
    activityReport: { councilOnly: true, takesDecisions: false },
    budget: { councilOnly: true, takesDecisions: true },
    presidencyElection: { councilOnly: true, takesDecisions: true },
} as const satisfies Record<MeetingKind, {
    councilOnly: boolean;
    /** The meeting votes decisions that Diavgeia publishes (150 §6 and circular 50602 say λογοδοσία and απολογισμός do not). */
    takesDecisions: boolean;
}>;

function keysWhere<K extends string, V>(table: Record<K, V>, test: (value: V) => boolean): K[] {
    return (Object.keys(table) as K[]).filter((key) => test(table[key]));
}

export const TAKES_PLACE_STATUSES = keysWhere(SCHEDULE_STATUSES, (status) => status.takesPlace);
export const OFFERED_FORMATS = keysWhere(MEETING_FORMATS, (format) => format.offeredInForm);
export const COUNCIL_ONLY_KINDS: ReadonlySet<MeetingKind> = new Set(keysWhere(MEETING_KINDS, (kind) => kind.councilOnly));
export const NO_DECISION_KINDS = keysWhere(MEETING_KINDS, (kind) => !kind.takesDecisions);

/** The meeting takes place on its date: it is neither postponed nor cancelled. */
export function takesPlace(meeting: { scheduleStatus: MeetingScheduleStatus }): boolean {
    return SCHEDULE_STATUSES[meeting.scheduleStatus].takesPlace;
}

/** `takesPlace` as a database filter. */
export const TAKES_PLACE_WHERE = {
    scheduleStatus: { in: TAKES_PLACE_STATUSES },
} satisfies Prisma.CouncilMeetingWhereInput;

/** The columns that say whether a meeting has a recording the public can watch. */
export type RecordingFields = { format: MeetingFormat | null; noRecording: boolean };

/**
 * The format of the meeting has a recording: no stream or transcript
 * otherwise. A meeting of unstated format can have one. A meeting closed to
 * the public is still recorded: that fact gates nothing. A meeting that the
 * body marked as not recorded has none (#829).
 */
export function hasPublicRecording(meeting: RecordingFields): boolean {
    return formatRules(meeting.format).publicRecording && !meeting.noRecording;
}

/**
 * `hasPublicRecording` as a database filter. In SQL `format IN (…)` is not
 * true for a null format, so the null case is explicit.
 */
export const PUBLIC_RECORDING_WHERE = {
    noRecording: false,
    OR: [
        ...(UNSTATED_FORMAT.publicRecording ? [{ format: null }] : []),
        { format: { in: keysWhere(MEETING_FORMATS, (format) => format.publicRecording) } },
    ],
} satisfies Prisma.CouncilMeetingWhereInput;


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
        fail('councilOnlyKind', 'Only a council holds a special meeting.');
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
            if (ctx.postponedFromTaken) {
                fail('postponedFromTaken', 'The postponed meeting already has a new meeting. Remove that link first.');
            }
            if (ctx.chainReachesSelf) {
                fail('postponementCycle', 'This link would make the postponements a cycle.');
            }
            if (next.dateTime.getTime() <= ctx.postponedFrom.dateTime.getTime()) {
                fail('postponedToEarlier', 'The new meeting must take place after the meeting it replaces.');
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

    return errors;
}

/**
 * Why a meeting takes no transcription, or null when it does. A postponed or
 * cancelled meeting did not take place on its date, and a meeting held by
 * circulation or marked as not recorded has no recording.
 */
export function transcriptionRefusal(meeting: Pick<CouncilMeeting, 'scheduleStatus' | 'noRecording' | 'format'>): string | null {
    if (!takesPlace(meeting)) return `Meeting is ${meeting.scheduleStatus}`;
    if (meeting.noRecording) return 'Meeting was not recorded: it has no recording to transcribe';
    if (!hasPublicRecording(meeting)) return `Meeting is held as ${meeting.format}: it has no recording to transcribe`;
    return null;
}
