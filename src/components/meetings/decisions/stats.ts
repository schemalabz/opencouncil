import type { MeetingCandidate } from '@/lib/db/decisionCandidateShape';

export interface DecisionStats {
    total: number;
    withDecision: number;
    conflicts: number;
}

/**
 * Meeting decision health at a glance: how many subjects are matched, and how
 * much work remains. Accepts any candidate shape that carries `conflict`, so
 * both server rows and their JSON-serialized client views fit.
 */
export function computeDecisionStats(
    subjectIds: string[],
    decisions: Record<string, unknown>,
    candidates: ReadonlyArray<Pick<MeetingCandidate, 'conflict'>>,
): DecisionStats {
    return {
        total: subjectIds.length,
        withDecision: subjectIds.filter((id) => decisions[id]).length,
        conflicts: candidates.filter((c) => c.conflict).length,
    };
}
