import { Prisma } from '@prisma/client';
import { CUSTOMER_CITY_WHERE } from '@/lib/cityStatus';
import { TAKES_PLACE_WHERE } from '@/lib/meetingLifecycleRules';
import { getPollableMeetingDateRange, TAKES_DECISIONS_WHERE } from '@/lib/tasks/pollDecisionsBackoff';
import { primaryMeetingWhere } from '@/lib/utils/bodyTier';

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

// A meeting still waiting on decisions: a decision-eligible subject without
// one, and not a meeting that takes no decisions (see takesNoDecisions). What the cron and
// follow-up polls both require before polling a meeting. A postponed or
// cancelled meeting took no decisions on its date.
export const AWAITING_DECISIONS_MEETING_WHERE = {
    ...TAKES_DECISIONS_WHERE,
    ...TAKES_PLACE_WHERE,
    subjects: { some: { ...DECISION_ELIGIBLE_SUBJECT_WHERE, decision: null } },
    // A secondary body publishes no decisions (#829).
    ...primaryMeetingWhere,
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
