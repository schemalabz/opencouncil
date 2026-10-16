// When a document of a meeting is ready to go out (#874). Pure: the cron, the
// poll callback, the review completion and the decisions page all ask this, and
// the unit tests cover every branch. Keep it free of server-only imports.
import type { DocumentKind, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import type { ReadinessFacts } from '@/lib/db/types/documentSend';
import { isPolledOnItsOwn } from '@/lib/db/decisionEligibility';
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
    /**
     * A summarize succeeded for the meeting. The minutes take the subjects
     * discussed outside the agenda, and the discussion of every subject, from it.
     */
    summarized: boolean;
    /** The cron polls the meeting's decisions on its own (isPolledOnItsOwn). */
    pollable: boolean;
    /**
     * A decision poll ended after the latest summarize: it looked for the
     * decisions of the subjects that summarize added.
     */
    polledAfterSummarize: boolean;
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
    /** No summarize succeeded yet: the minutes would lack the subjects outside the agenda and the discussion. */
    | 'summarize'
    /** The meeting takes decisions but has no eligible subject yet: no agenda. The decisions page says so. */
    | 'agenda'
    | 'decisions'
    /** Due, with subjects still missing: one poll looks for them after the summarize first. */
    | 'poll';

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
 * timezone. A meeting on 1 Oct is due at 00:00 on 6 Oct, local time, so the
 * daily cron of 6 Oct sends it, whatever hour the meeting began.
 */
export function minutesDueAt(meetingDate: Date, timeZone: string): Date {
    const [year, month, day] = localCalendarDate(meetingDate, timeZone).split('-').map(Number);
    const dueDay = new Date(Date.UTC(year, month - 1, day + MINUTES_THRESHOLD_DAYS)).toISOString().slice(0, 10);
    return fromZonedTime(`${dueDay}T00:00:00`, timeZone);
}

const transcriptRule: DocumentRule = () => ({ state: 'complete' });

const minutesRule: DocumentRule = ({ meeting, subjects, hasAgenda, summarized, pollable, polledAfterSummarize, now }) => {
    if (!summarized) return { state: 'wait', reason: 'summarize', dueAt: null };
    // A λογοδοσία takes no decisions, so its minutes are complete once
    // summarized, whatever its agenda holds: no poll fetches decisions for it,
    // and its subjects would otherwise read as missing their decision for ever.
    if (takesNoDecisions(meeting)) return { state: 'complete' };
    // No subject left to decide: complete when the agenda exists (its items
    // were all withdrawn), and a wait for the agenda when it does not yet.
    if (subjects.length === 0) return hasAgenda ? { state: 'complete' } : { state: 'wait', reason: 'agenda', dueAt: null };
    const missingSubjectIds = undecidedSubjectIds({ subjects });
    if (missingSubjectIds.length === 0) return { state: 'complete' };
    const dueAt = minutesDueAt(meeting.dateTime, meeting.city.timezone);
    if (now.getTime() < dueAt.getTime()) return { state: 'wait', reason: 'decisions', dueAt };
    // Due: one poll first looks for the decisions of the subjects that the
    // summarize added, so the minutes do not list as missing what Diavgeia has.
    if (pollable && !polledAfterSummarize) return { state: 'wait', reason: 'poll', dueAt: null };
    return { state: 'incomplete', missingSubjectIds };
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

/** A document the cron, the poll callback and the review completion send on their own. */
export function isAutomaticDocument(kind: DocumentKind): boolean {
    return DOCUMENT_RULES[kind].automation === 'whenReady';
}

/** The documents the cron, the poll callback and the review completion send on their own. */
export const AUTOMATIC_DOCUMENTS = (Object.keys(DOCUMENT_RULES) as DocumentKind[]).filter(isAutomaticDocument);

/** A readiness that a send can act on. */
export type SendableReadiness = Extract<Readiness, { state: 'complete' | 'incomplete' }>;

export function isSendable(readiness: Readiness): readiness is SendableReadiness {
    return readiness.state === 'complete' || readiness.state === 'incomplete';
}

/** The subjects a sendable readiness goes out without. */
export function missingSubjectIdsOf(readiness: SendableReadiness): string[] {
    return readiness.state === 'incomplete' ? readiness.missingSubjectIds : [];
}

/** The subjects of the input that have no decision yet. */
function undecidedSubjectIds(input: Pick<ReadinessInput, 'subjects'>): string[] {
    return input.subjects.filter(subject => !subject.decided).map(subject => subject.id);
}

/**
 * The readiness input of one document of a meeting, from the facts of the
 * meeting. `reviewed` lets the review dialog ask as if the review were done.
 */
export function readinessInputFor(facts: ReadinessFacts, kind: DocumentKind, now: Date, { reviewed }: { reviewed?: boolean } = {}): ReadinessInput {
    const summaries = facts.taskStatuses.filter(task => task.type === 'summarize');
    // A summarize reads as done when its row last changed: the flip to succeeded
    const lastSummarizedAt = summaries.reduce<Date | null>((latest, task) => (!latest || task.updatedAt > latest ? task.updatedAt : latest), null);
    return {
        setting: facts.administrativeBody?.documentSendSettings.find(setting => setting.kind === kind) ?? null,
        meeting: facts,
        reviewed: reviewed ?? facts.taskStatuses.some(task => task.type === 'humanReview'),
        summarized: lastSummarizedAt !== null,
        pollable: isPolledOnItsOwn(facts, now),
        polledAfterSummarize: lastSummarizedAt !== null
            && facts.taskStatuses.some(task => task.type === 'pollDecisions' && task.createdAt > lastSummarizedAt),
        subjects: facts.subjects.map(subject => ({ id: subject.id, decided: subject.decision !== null })),
        hasAgenda: facts._count.subjects > 0,
        now,
    };
}

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
    const automatic = isAutomaticDocument(document);
    if (!setting || !setting.enabled) return { state: 'none', reason: 'disabled' };
    if (automatic && !byHand && !settingAppliesTo(setting, meeting.dateTime)) return { state: 'none', reason: 'beforeSwitch' };
    if (!takesPlace(meeting)) return { state: 'none', reason: 'notHeld' };
    if (automatic && meeting.continuationOfId !== null) return { state: 'none', reason: 'laterPart' };
    if (!reviewed && (automatic || !byHand)) {
        return { state: 'wait', reason: 'review', dueAt: null };
    }
    return DOCUMENT_RULES[document].ready(input);
}

/**
 * What a send by hand would send now. It keeps every gate of the rule but
 * one: before the threshold, or before the poll after the summarize, it sends
 * the minutes with what is there, as provisional.
 */
export function evaluateManualReadiness(document: DocumentKind, input: ReadinessInput): Readiness {
    const readiness = evaluateReadiness(document, input, { byHand: true });
    if (readiness.state === 'wait' && (readiness.reason === 'decisions' || readiness.reason === 'poll')) {
        return { state: 'incomplete', missingSubjectIds: undecidedSubjectIds(input) };
    }
    return readiness;
}
