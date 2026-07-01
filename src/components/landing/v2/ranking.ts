import type { AdministrativeBodyType } from '@prisma/client';
import type { LandingSubject } from './landingData';

/**
 * Distribution-aware subject ranking for the landing list. Adapted from the CivicMap
 * ranking (schemalabz/opencouncil#472): a subject's importance blends how recent and how
 * much-discussed it is, plus bonuses that keep the list varied. Every signal is z-scored
 * against the set being ranked — so it adapts to whatever the list currently holds, and a
 * flat/zero-variance signal (e.g. a single municipality) drops out of the blend on its own.
 *
 *   - recency:           newer meetings rank higher
 *   - discussion:        longer debates rank higher (log-damped, so a few marathons don't dominate)
 *   - smallMunicipality: subjects from δήμοι with fewer subjects here get a lift, so zooming
 *                        out doesn't leave the list all-Αθήνα
 *   - adminBody:         Δημοτικό Συμβούλιο > Επιτροπή > Κοινότητα (so ΔΚ don't flood it)
 *   - location:          a flat edge for subjects that have a location over unlocated ones
 */
export interface LandingRankingWeights {
    recency: number;
    discussion: number;
    smallMunicipality: number;
    adminBody: number;
    location: number;
}

/** Tune the blend here. */
export const DEFAULT_LANDING_RANKING_WEIGHTS: LandingRankingWeights = {
    recency: 1.5,
    discussion: 0.8,
    smallMunicipality: 0.15,
    adminBody: 0.4,
    location: 0.1,
};

/** Δημοτικό Συμβούλιο > Δημοτική Επιτροπή > Δημοτική Κοινότητα. */
const ADMIN_BODY_TIER: Record<AdministrativeBodyType, number> = {
    council: 1,
    committee: 0.5,
    community: 0,
};

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * z-scores values against their own mean/stdev. Nulls (a missing signal) map to 0 —
 * neutral. A zero-variance signal (every subject equal) yields all zeros, so it naturally
 * drops out of the blend rather than needing a special case.
 */
function zScores(values: (number | null)[]): number[] {
    const present = values.filter((v): v is number => v !== null);
    const m = mean(present);
    const sd = Math.sqrt(mean(present.map((v) => (v - m) ** 2)));
    if (sd === 0) return values.map(() => 0);
    return values.map((v) => (v === null ? 0 : (v - m) / sd));
}

/** Importance score per subject (same index order as the input). */
export function scoreLandingSubjects(
    subjects: LandingSubject[],
    weights: LandingRankingWeights = DEFAULT_LANDING_RANKING_WEIGHTS,
): number[] {
    // Municipality "size" = how many of the ranked subjects it contributes; smaller
    // municipalities (fewer subjects here) get the lift.
    const cityCounts = new Map<string, number>();
    for (const s of subjects) cityCounts.set(s.cityId, (cityCounts.get(s.cityId) ?? 0) + 1);

    const recency = zScores(subjects.map((s) => (s.date ? Date.parse(s.date) : null)));
    // durationMin is the landing's discussion metric (the API only exposes rounded minutes);
    // log-damped like the CivicMap seconds metric so a few long debates don't dwarf the rest.
    const discussion = zScores(subjects.map((s) => Math.log1p(Math.max(0, s.durationMin))));
    const smallMunicipality = zScores(subjects.map((s) => -(cityCounts.get(s.cityId) ?? 0)));
    const adminBody = zScores(subjects.map((s) => (s.adminBodyType ? ADMIN_BODY_TIER[s.adminBodyType] : null)));

    return subjects.map(
        (s, i) =>
            weights.recency * recency[i] +
            weights.discussion * discussion[i] +
            weights.smallMunicipality * smallMunicipality[i] +
            weights.adminBody * adminBody[i] +
            // location is a flat 0/1 boost, not z-scored — a deliberate tiebreaker
            weights.location * (s.where.trim() ? 1 : 0),
    );
}

/** Subjects ranked best-first. Ties keep input order (stable sort). */
export function rankLandingSubjects(
    subjects: LandingSubject[],
    weights: LandingRankingWeights = DEFAULT_LANDING_RANKING_WEIGHTS,
): LandingSubject[] {
    const scores = scoreLandingSubjects(subjects, weights);
    return subjects
        .map((subject, index) => ({ subject, score: scores[index], index }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.subject);
}
