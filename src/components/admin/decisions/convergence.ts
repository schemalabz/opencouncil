import type { CityDecisionHealth } from '@/lib/db/decisionHealth';
import { cityState } from '@/lib/db/decisionHealthState';

/** The header's aggregate figures, derived once from the per-city rows. */
export interface ConvergenceTotals {
    eligibleSubjects: number;
    linkedSubjects: number;
    withoutDecision: number;
    contentLinks: number;
    unplaced: number;
    unplacedUnread: number;
    conflicts: number;
    unplaceable: number;
}

export function convergenceTotals(cities: CityDecisionHealth[]): ConvergenceTotals {
    const inScope = cities.filter(c => c.inScope);
    const sum = (f: (c: CityDecisionHealth) => number) => inScope.reduce((a, c) => a + f(c), 0);
    const eligible = sum(c => c.eligibleSubjects);
    const linked = sum(c => c.linkedSubjects);
    return {
        eligibleSubjects: eligible,
        linkedSubjects: linked,
        withoutDecision: eligible - linked,
        contentLinks: sum(c => c.contentLinks),
        unplaced: sum(c => c.unplacedCandidates),
        unplacedUnread: sum(c => c.unplacedUnread),
        conflicts: sum(c => c.conflicts),
        unplaceable: sum(c => c.unplaceable.total),
    };
}

const STATE_ORDER = { blocked: 0, needsTriage: 1, draining: 2, notStarted: 3, drained: 4, outOfScope: 5 } as const;

export function sortCities(cities: CityDecisionHealth[]): CityDecisionHealth[] {
    return [...cities].sort((a, b) =>
        STATE_ORDER[cityState(a)] - STATE_ORDER[cityState(b)] || b.eligibleSubjects - a.eligibleSubjects);
}
