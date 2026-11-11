import { Prisma, type CityStatus, type MeetingKind, type MeetingScheduleStatus } from '@prisma/client';
import { CUSTOMER_CITY_WHERE, isCustomer } from '@/lib/cityStatus';
import { TAKES_PLACE_WHERE, takesPlace } from '@/lib/meetingLifecycleRules';
import { getPollableMeetingDateRange, takesNoDecisions, TAKES_DECISIONS_WHERE } from '@/lib/tasks/pollDecisionsBackoff';

/**
 * Which subjects can carry a decision — the single definition, shared by every
 * query that filters on eligibility. Lives outside the server-only modules so
 * non-Next callers (tsx scripts) can reach the queries.
 *
 * The SQL twin of `isRecordSubject` in `@/lib/utils/subjects`, plus the
 * `withdrawn` clause the in-memory rule leaves to its callers (the decisions
 * page lists withdrawn rows, it just never counts them as pending). Postgres
 * evaluates one and V8 the other, so nothing can make them agree by
 * construction — keep the two in step by hand. When they disagree, the poll
 * and the counts take a subject the page has no row for, which reads as a gap
 * nothing on the page can ever clear.
 */
export const DECISION_ELIGIBLE_SUBJECT_WHERE = {
    withdrawn: false,
    OR: [
        // An agenda position counts only for a subject that carries no
        // non-agenda register. Spelled as a positive `nonAgendaReason: null`
        // rather than a `not: 'beforeAgenda'`, which would leave the answer
        // to how Prisma renders a negation over a nullable column.
        { agendaItemIndex: { not: null }, nonAgendaReason: null },
        { nonAgendaReason: 'outOfAgenda' as const },
    ],
} satisfies Prisma.SubjectWhereInput;

/**
 * The subjects of the record, withdrawn ones included: the SQL twin of
 * `isRecordSubject`. The minutes list a withdrawn item, so an agenda whose
 * every item was withdrawn is still an agenda, with nothing left to decide.
 */
export const RECORD_SUBJECT_WHERE = { OR: DECISION_ELIGIBLE_SUBJECT_WHERE.OR } satisfies Prisma.SubjectWhereInput;

// A meeting still waiting on decisions: a decision-eligible subject without
// one, and not a meeting that takes no decisions (see takesNoDecisions). What the cron and
// follow-up polls both require before polling a meeting. A postponed or
// cancelled meeting took no decisions on its date.
export const AWAITING_DECISIONS_MEETING_WHERE = {
    ...TAKES_DECISIONS_WHERE,
    ...TAKES_PLACE_WHERE,
    subjects: { some: { ...DECISION_ELIGIBLE_SUBJECT_WHERE, decision: null } },
} satisfies Prisma.CouncilMeetingWhereInput;

/**
 * The meetings that the decision-polling cron polls on its own: in the pollable
 * date window, waiting on decisions, in a supported city with a Diavgeia org uid.
 * Each poll is a paid task, so a pending or demo city is polled only when an
 * admin asks for it. The cron and the polling stats both read this one filter,
 * so the stats list exactly the meetings that the cron can still poll.
 */
export function decisionPollCandidateWhere(now: Date = new Date()) {
    return {
        ...AWAITING_DECISIONS_MEETING_WHERE,
        dateTime: getPollableMeetingDateRange(now),
        city: { diavgeiaUid: { not: null }, ...CUSTOMER_CITY_WHERE },
    } satisfies Prisma.CouncilMeetingWhereInput;
}

/**
 * `decisionPollCandidateWhere` in memory, for a meeting that is waiting on
 * decisions: whether the cron polls it on its own. The minutes wait for such
 * a poll and nothing else; a meeting no poll will reach must not wait for one.
 * Keep the two in step, as the eligibility pair above.
 */
export function isPolledOnItsOwn(meeting: {
    dateTime: Date;
    scheduleStatus: MeetingScheduleStatus;
    kind: MeetingKind | null;
    continuationOf: { kind: MeetingKind | null } | null;
    city: { diavgeiaUid: string | null; status: CityStatus };
}, now: Date = new Date()): boolean {
    const window = getPollableMeetingDateRange(now);
    return takesPlace(meeting)
        && !takesNoDecisions(meeting)
        && meeting.dateTime >= window.gte && meeting.dateTime <= window.lte
        && meeting.city.diavgeiaUid !== null
        && isCustomer(meeting.city.status);
}
