import type { Prisma } from '@prisma/client';

/**
 * Which subjects can carry a decision — the single definition, shared by every
 * query that filters on eligibility. Lives outside the server-only modules so
 * non-Next callers (tsx scripts) can reach the queries.
 *
 * A beforeAgenda subject is never eligible, even if it carries an
 * agendaItemIndex: the body raises it before the agenda, so Diavgeia publishes
 * no decision for it. The two branches spell that out rather than filtering
 * `nonAgendaReason` with `not`, whose null semantics are easy to read wrong.
 */
export const DECISION_ELIGIBLE_SUBJECT_WHERE = {
    withdrawn: false,
    OR: [
        { agendaItemIndex: { not: null }, nonAgendaReason: null },
        { nonAgendaReason: 'outOfAgenda' as const },
    ],
} satisfies Prisma.SubjectWhereInput;

/**
 * The same rule in prose, for an error a person reads. Every throw site quotes
 * this instead of restating the rule, because prose drifts silently.
 */
export const DECISION_ELIGIBILITY_RULE =
    'a subject must be an agenda item or be outOfAgenda, and must not be withdrawn';

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
    if (subject.nonAgendaReason === 'outOfAgenda') return true;
    return subject.agendaItemIndex !== null && subject.nonAgendaReason === null;
}
