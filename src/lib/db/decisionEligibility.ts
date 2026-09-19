import { Prisma } from '@prisma/client';

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
