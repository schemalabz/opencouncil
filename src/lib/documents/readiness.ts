// When a document of a meeting is ready to go out (#874). Pure: the cron, the
// poll callback, the review completion and the admin list all ask this, and
// the unit tests cover every branch. Keep it free of server-only imports.
import type { DocumentKind, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { localCalendarDate } from '@/lib/formatters/time';
import { takesPlace } from '@/lib/meetingLifecycleRules';
import { takesNoDecisions } from '@/lib/tasks/pollDecisionsBackoff';
import { MINUTES_THRESHOLD_DAYS, settingAppliesTo, type DocumentSendRule } from './settings';

/** The columns of a meeting that the rules read. */
export interface ReadinessMeeting {
    dateTime: Date;
    scheduleStatus: MeetingScheduleStatus;
    continuationOfId: string | null;
    kind: MeetingKind | null;
    continuationOf: { kind: MeetingKind | null } | null;
    /** The threshold counts calendar days where the meeting took place. */
    city: { timezone: string };
}

export interface ReadinessInput {
    setting: DocumentSendRule | null;
    meeting: ReadinessMeeting;
    /** A humanReview task succeeded for the meeting. No document goes out before it. */
    reviewed: boolean;
    /** The decision-eligible subjects (DECISION_ELIGIBLE_SUBJECT_WHERE), each with whether it has its decision. */
    subjects: Array<{ id: string; decided: boolean }>;
    /** The meeting has an agenda, withdrawn items included: a meeting can have one and no subject left to decide. */
    hasAgenda: boolean;
    now: Date;
}

/** Why a document is never sent for this meeting. */
export type NotSentReason =
    | 'disabled'
    /** The meeting predates the switch-on of the setting. */
    | 'beforeSwitch'
    /** Postponed or cancelled. */
    | 'notHeld'
    /** A later part of a continued meeting sends nothing of its own. */
    | 'laterPart';

/** What a document waits for. */
export type WaitReason =
    | 'review'
    /** The meeting takes decisions but has no eligible subject yet: no agenda. The admin list flags it. */
    | 'agenda'
    | 'decisions';

export type Readiness =
    | { state: 'none'; reason: NotSentReason }
    | { state: 'wait'; reason: WaitReason; /** When the threshold sends the document anyway; null when nothing will. */ dueAt: Date | null }
    | { state: 'complete' }
    | { state: 'incomplete'; missingSubjectIds: string[] };

/** The readiness of a document once the common gates (below) have passed. */
type DocumentRule = (input: ReadinessInput) => Readiness;

/**
 * How a document goes out without a person asking. `reviewChoice`: at the review
 * completion, when the reviewer leaves its checkbox ticked; the cron never sends
 * it. `whenReady`: the cron, the poll callback and the review completion send it
 * as soon as this module says complete or incomplete.
 */
export type DocumentAutomation = 'reviewChoice' | 'whenReady';

/**
 * The moment the minutes go out with or without every decision: the start of
 * the MINUTES_THRESHOLD_DAYS-th calendar day after the meeting, in the city's
 * timezone. A meeting on 1 Oct is due at 00:00 on 11 Oct, local time, so the
 * daily cron of 11 Oct sends it, whatever hour the meeting began.
 */
export function minutesDueAt(meetingDate: Date, timeZone: string): Date {
    const [year, month, day] = localCalendarDate(meetingDate, timeZone).split('-').map(Number);
    const dueDay = new Date(Date.UTC(year, month - 1, day + MINUTES_THRESHOLD_DAYS)).toISOString().slice(0, 10);
    return fromZonedTime(`${dueDay}T00:00:00`, timeZone);
}

const transcriptRule: DocumentRule = () => ({ state: 'complete' });

const minutesRule: DocumentRule = ({ meeting, subjects, hasAgenda, now }) => {
    // A λογοδοσία takes no decisions, so its minutes are complete at review
    // time, whatever its agenda holds: no poll fetches decisions for it, and
    // its subjects would otherwise read as missing their decision for ever.
    if (takesNoDecisions(meeting)) return { state: 'complete' };
    // No subject left to decide: complete when the agenda exists (its items
    // were all withdrawn), and a wait for the agenda when it does not yet.
    if (subjects.length === 0) return hasAgenda ? { state: 'complete' } : { state: 'wait', reason: 'agenda', dueAt: null };
    const missingSubjectIds = subjects.filter(subject => !subject.decided).map(subject => subject.id);
    if (missingSubjectIds.length === 0) return { state: 'complete' };
    const dueAt = minutesDueAt(meeting.dateTime, meeting.city.timezone);
    if (now.getTime() >= dueAt.getTime()) return { state: 'incomplete', missingSubjectIds };
    return { state: 'wait', reason: 'decisions', dueAt };
};

/**
 * One rule per document. A new DocumentKind fails to compile here until it says
 * how it goes out and when it is ready (the registry in registry.ts holds the
 * renderer and the email, for the same reason).
 */
export const DOCUMENT_RULES = {
    transcript: { automation: 'reviewChoice', ready: transcriptRule },
    minutes: { automation: 'whenReady', ready: minutesRule },
} as const satisfies Record<DocumentKind, { automation: DocumentAutomation; ready: DocumentRule }>;

/** The documents the cron, the poll callback and the review completion send on their own. */
export const AUTOMATIC_DOCUMENTS = (Object.keys(DOCUMENT_RULES) as DocumentKind[])
    .filter(document => DOCUMENT_RULES[document].automation === 'whenReady');

/**
 * Whether a document of a meeting goes out, waits, or never goes.
 *
 * Every document needs a setting that is on and a meeting that took place.
 * The other gates belong to the documents that go out on their own (the
 * minutes): a meeting held before the switch-on is never sent, so switching a
 * document on does not email the archive, and a later part of a continued
 * meeting has no minutes of its own. A document a person chooses to send (the
 * transcript) has its own transcript for every part, and the person decides
 * which meetings get it.
 *
 * The review gate holds for every send nobody asked for. `byHand` is a send a
 * person asked for: it may send a meeting held before the switch-on, and a
 * reviewChoice document before its review, as the transcript button always could.
 */
export function evaluateReadiness(document: DocumentKind, input: ReadinessInput, { byHand = false }: { byHand?: boolean } = {}): Readiness {
    const { setting, meeting, reviewed } = input;
    const automatic = DOCUMENT_RULES[document].automation === 'whenReady';
    if (!setting || !setting.enabled) return { state: 'none', reason: 'disabled' };
    if (automatic && !byHand && !settingAppliesTo(setting, meeting.dateTime)) return { state: 'none', reason: 'beforeSwitch' };
    if (!takesPlace(meeting)) return { state: 'none', reason: 'notHeld' };
    if (automatic && meeting.continuationOfId !== null) return { state: 'none', reason: 'laterPart' };
    if (!reviewed && (automatic || !byHand)) {
        return { state: 'wait', reason: 'review', dueAt: null };
    }
    return DOCUMENT_RULES[document].ready(input);
}
