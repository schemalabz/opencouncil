import { isPendingDecision } from '@/components/meetings/decisions/timeline';

/** What routing needs from an unplaced candidate. */
interface RoutableCandidate {
    /** The subject the extraction suggests, when it suggests one. */
    subjectId: string | null;
    /** Set when the candidate's ADA is already linked to another subject. */
    conflict: { subjectId: string } | null;
}

/** What routing needs from a row on the page. */
export interface RoutableSubject {
    id: string;
    withdrawn: boolean;
}

export interface RoutedCandidates<C> {
    /** The candidate proposing itself on a subject's row, by subject id — at most one per subject. */
    proposalBySubject: Map<string, C>;
    /** Everything that could not propose itself, in candidate order. */
    trayCandidates: C[];
    /** The candidate whose ADA collides, keyed by the subject that already holds it. */
    conflictsByHolder: Map<string, C>;
}

/**
 * Subject-centric inversion of the unplaced candidates: each one either proposes
 * itself on its suggested subject's row, or waits in the tray below the list. A
 * conflict annotates the subject that already holds the ADA.
 *
 * A candidate proposes itself only on a subject that is still waiting for a
 * decision — the page's {@link isPendingDecision} rule, so the proposal, the
 * action tile and the "without a decision" filter cannot disagree — and only
 * when no earlier candidate has claimed that subject. Everything else goes to
 * the tray, which is what the unplaced-documents tile counts.
 *
 * Lives outside the page component so the routing can be tested directly: it is
 * five conditions deep and first-wins in two places, and the tile that reports
 * its result has no other way to be verified.
 */
export function routeCandidates<C extends RoutableCandidate, S extends RoutableSubject>(
    candidates: readonly C[],
    displaySubjects: readonly S[],
    hasDecision: (subjectId: string) => boolean,
): RoutedCandidates<C> {
    const subjectById = new Map(displaySubjects.map(s => [s.id, s]));

    const proposalBySubject = new Map<string, C>();
    const trayCandidates: C[] = [];
    for (const candidate of candidates) {
        const suggested = candidate.subjectId && !candidate.conflict
            ? subjectById.get(candidate.subjectId)
            : undefined;
        if (suggested && isPendingDecision(suggested, hasDecision(suggested.id)) && !proposalBySubject.has(suggested.id)) {
            proposalBySubject.set(suggested.id, candidate);
        } else {
            trayCandidates.push(candidate);
        }
    }

    const conflictsByHolder = new Map<string, C>();
    for (const candidate of candidates) {
        if (candidate.conflict && !conflictsByHolder.has(candidate.conflict.subjectId)) {
            conflictsByHolder.set(candidate.conflict.subjectId, candidate);
        }
    }

    return { proposalBySubject, trayCandidates, conflictsByHolder };
}

/**
 * Above this the resolver's own confidence is worth a word, below it nothing.
 *
 * The number itself never reaches the page: "90%" next to a yes/no question
 * makes a person weigh a statistic instead of reading two titles. From #749.
 */
export const LIKELY_MATCH_THRESHOLD = 0.6;

export function isLikelyMatch(candidate: { confidence: number | null }): boolean {
    return candidate.confidence !== null && candidate.confidence >= LIKELY_MATCH_THRESHOLD;
}

/** The subjects still waiting for a decision, split by whether one has been proposed. */
export interface WaitingSubjects<S> {
    /** A proposal sits on this subject's row, waiting for a yes or a no. */
    proposed: S[];
    /** Nothing was found: this row needs a number from the minutes, or an ΑΔΑ. */
    plain: S[];
}

/**
 * Which subjects the card counts as outstanding, and why each one is.
 *
 * A withdrawn subject is in neither list: it never takes a decision, so
 * counting it would make a finished meeting read as unfinished forever.
 */
export function splitWaitingSubjects<S extends RoutableSubject>(
    subjects: readonly S[],
    hasDecision: (subjectId: string) => boolean,
    proposalBySubject: ReadonlyMap<string, unknown>,
): WaitingSubjects<S> {
    const proposed: S[] = [];
    const plain: S[] = [];
    for (const subject of subjects) {
        if (!isPendingDecision(subject, hasDecision(subject.id))) continue;
        (proposalBySubject.has(subject.id) ? proposed : plain).push(subject);
    }
    return { proposed, plain };
}

/** What the card's badge shows: every subject waiting, plus every decision waiting. */
export function attentionCount(
    routed: Pick<RoutedCandidates<unknown>, 'trayCandidates' | 'conflictsByHolder'>,
    waiting: WaitingSubjects<unknown>,
): number {
    return waiting.proposed.length + waiting.plain.length + routed.trayCandidates.length + routed.conflictsByHolder.size;
}

/**
 * Seconds a person needs per outstanding item, measured generously: a yes/no on
 * two titles, a number typed from the minutes, a choice between two subjects,
 * reading a document's ΘΕΜΑ line. From #749, plus the two subject kinds.
 */
const SECONDS_PER_ITEM = { proposal: 20, plainSubject: 40, tray: 40, conflict: 40 } as const;

export type WorkEstimate = { kind: 'underMinute' } | { kind: 'minutes'; minutes: number };

export function estimateWork(
    routed: Pick<RoutedCandidates<unknown>, 'trayCandidates' | 'conflictsByHolder'>,
    waiting: WaitingSubjects<unknown>,
): WorkEstimate {
    const seconds = waiting.proposed.length * SECONDS_PER_ITEM.proposal
        + waiting.plain.length * SECONDS_PER_ITEM.plainSubject
        + routed.trayCandidates.length * SECONDS_PER_ITEM.tray
        + routed.conflictsByHolder.size * SECONDS_PER_ITEM.conflict;
    if (seconds < 60) return { kind: 'underMinute' };
    return { kind: 'minutes', minutes: Math.ceil(seconds / 60) };
}
