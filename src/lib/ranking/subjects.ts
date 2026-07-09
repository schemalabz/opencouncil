import type { AdministrativeBodyType } from '@prisma/client';

/**
 * Distribution-aware subject ranking — the single standard way to order
 * subjects by importance / "hotness" across the app (meeting cards, the
 * meeting dashboard, story exports, the embeddable widgets, …).
 *
 * Every signal is z-scored against the set being ranked (so it adapts to
 * whatever subjects are passed in) and blended with configurable weights.
 * Signals that don't vary across the set — a single meeting's date, a single
 * municipality, a single admin-body type — collapse to zero and naturally
 * drop out of the blend, so the same function works for one meeting's agenda
 * and for a cross-meeting "hot" feed alike.
 *
 * Callers adapt their own objects into {@link RankableSubject} via an `adapt`
 * function, keeping call sites ergonomic and the ranker decoupled from any
 * one data shape.
 */

/** Normalized input the ranker reads. Adapt domain objects into this shape. */
export interface RankableSubject {
    /** Municipality id — drives the small-municipality lift. Collapses when every subject shares one city. */
    cityId?: string | null;
    /** Meeting date — drives recency. Missing → neutral. */
    meetingDate?: Date | string | null;
    /** Discussion magnitude — a speaker-contribution count or a discussion duration,
     *  whichever the caller has (log-damped). Higher = more discussed. */
    discussionSignal: number;
    /** Council > committee > community. Collapses when every subject shares one body type. */
    adminBodyType?: AdministrativeBodyType | null;
    /** Whether the subject has a map location — a weak tiebreaker. */
    hasLocation?: boolean;
}

export interface SubjectRankingWeights {
    /** Newer meetings rank higher. */
    recency: number;
    /** More-discussed subjects rank higher (contribution count, log-damped). */
    discussion: number;
    /** Subjects from smaller municipalities get a lift (only with several municipalities). */
    smallMunicipality: number;
    /** Council ranks over committee over community (only with several body types). */
    adminBody: number;
    /**
     * A located subject gets a slight edge over an identical unlocated one —
     * deliberately the weakest signal. Unlocated (municipality-wide) subjects
     * are the majority in most δήμοι, so a strong boost here would bury them
     * below a list cap; this is a tiebreaker, not a category filter.
     */
    location: number;
}

/** Tune the global defaults here; callers pass partial overrides. */
export const DEFAULT_SUBJECT_RANKING_WEIGHTS: SubjectRankingWeights = {
    recency: 1,
    discussion: 1.1,
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

export interface RankingComponent {
    key: keyof SubjectRankingWeights;
    weight: number;
    /** Normalized signal — a z-score, or 0/1 for the flat location boost. */
    signal: number;
    /** weight × signal */
    contribution: number;
}

export interface SubjectRanking<T> {
    item: T;
    score: number;
    components: RankingComponent[];
}

export interface SubjectRankingOptions {
    weights?: Partial<SubjectRankingWeights>;
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * z-scores the values against their own mean/stdev. Nulls (a missing
 * signal) map to 0 — neutral. A zero-variance signal (every subject equal,
 * e.g. a single municipality) yields all zeros, so it naturally drops out
 * of the blend rather than needing a special case.
 */
function zScores(values: (number | null)[]): number[] {
    const present = values.filter((value): value is number => value !== null);
    const m = mean(present);
    const variance = mean(present.map(value => (value - m) ** 2));
    const sd = Math.sqrt(variance);
    if (sd === 0) return values.map(() => 0);
    return values.map(value => (value === null ? 0 : (value - m) / sd));
}

/** Discussion signal: log-damped so a few marathon items don't dwarf the rest. */
function discussionMetric(subject: RankableSubject): number {
    return Math.log1p(Math.max(0, subject.discussionSignal));
}

/**
 * Scores items (unsorted) with a per-item breakdown — for display and
 * debugging. Use {@link sortByRanking} for the ordered list.
 */
export function rankSubjects<T>(
    items: T[],
    adapt: (item: T) => RankableSubject,
    options: SubjectRankingOptions = {},
): SubjectRanking<T>[] {
    const weights = { ...DEFAULT_SUBJECT_RANKING_WEIGHTS, ...options.weights };
    const subjects = items.map(adapt);

    // Municipality "size" = how many of the ranked subjects it contributes;
    // smaller municipalities (fewer subjects here) get the lift.
    const cityCounts = new Map<string, number>();
    for (const subject of subjects) {
        if (subject.cityId == null) continue;
        cityCounts.set(subject.cityId, (cityCounts.get(subject.cityId) ?? 0) + 1);
    }

    const recency = zScores(subjects.map(s => (s.meetingDate ? new Date(s.meetingDate).getTime() : null)));
    const discussion = zScores(subjects.map(discussionMetric));
    const smallMunicipality = zScores(subjects.map(s => (s.cityId == null ? null : -(cityCounts.get(s.cityId) ?? 0))));
    const adminBody = zScores(subjects.map(s => (s.adminBodyType ? ADMIN_BODY_TIER[s.adminBodyType] : null)));

    return items.map((item, index) => {
        const locationSignal = subjects[index].hasLocation ? 1 : 0;
        const components: RankingComponent[] = [
            { key: 'recency', weight: weights.recency, signal: recency[index], contribution: weights.recency * recency[index] },
            { key: 'discussion', weight: weights.discussion, signal: discussion[index], contribution: weights.discussion * discussion[index] },
            { key: 'smallMunicipality', weight: weights.smallMunicipality, signal: smallMunicipality[index], contribution: weights.smallMunicipality * smallMunicipality[index] },
            { key: 'adminBody', weight: weights.adminBody, signal: adminBody[index], contribution: weights.adminBody * adminBody[index] },
            { key: 'location', weight: weights.location, signal: locationSignal, contribution: weights.location * locationSignal },
        ];
        const score = components.reduce((sum, component) => sum + component.contribution, 0);
        return { item, score, components };
    });
}

/** Items ranked best-first, with each one's score breakdown. Ties keep input order (stable). */
export function rankAndSortSubjects<T>(
    items: T[],
    adapt: (item: T) => RankableSubject,
    options?: SubjectRankingOptions,
): SubjectRanking<T>[] {
    return rankSubjects(items, adapt, options)
        .map((ranking, index) => ({ ranking, index }))
        .sort((a, b) => b.ranking.score - a.ranking.score || a.index - b.index)
        .map(entry => entry.ranking);
}

/** Sorted copy of `items`, best-first by ranking score. Ties keep input order (stable). */
export function sortByRanking<T>(
    items: T[],
    adapt: (item: T) => RankableSubject,
    options?: SubjectRankingOptions,
): T[] {
    return rankAndSortSubjects(items, adapt, options).map(ranking => ranking.item);
}
