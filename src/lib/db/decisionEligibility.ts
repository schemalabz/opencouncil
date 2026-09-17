import type { Prisma } from '@prisma/client';

/**
 * Which subjects can carry a decision — the single definition, shared by every
 * query that filters on eligibility. Lives outside the server-only modules so
 * non-Next callers (tsx scripts) can reach the queries.
 */
export const DECISION_ELIGIBLE_SUBJECT_WHERE = {
    withdrawn: false,
    OR: [
        { agendaItemIndex: { not: null } },
        { nonAgendaReason: 'outOfAgenda' as const },
    ],
} satisfies Prisma.SubjectWhereInput;

/**
 * The same rule as DECISION_ELIGIBLE_SUBJECT_WHERE, for a subject that a caller
 * already holds. The two must stay in step: a surface that offers a decision
 * poll and the query that runs it must agree on one answer. This file imports
 * no runtime value, so a Client Component can ask the question too.
 */
export function isDecisionEligibleSubject(subject: {
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
    withdrawn: boolean;
}): boolean {
    if (subject.withdrawn) return false;
    return subject.agendaItemIndex !== null || subject.nonAgendaReason === 'outOfAgenda';
}
