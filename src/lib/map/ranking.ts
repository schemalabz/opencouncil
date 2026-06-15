import type { AdministrativeBodyType } from '@prisma/client';
import type { MapSubject } from './types';

/**
 * Distribution-aware subject ranking. The default ordering surfaces
 * "recent subjects discussed a lot": every signal is z-scored against the
 * set being ranked (so it adapts to whatever is on screen) and blended with
 * configurable weights. Used wherever subjects are listed — the map panel,
 * the meeting pages, and the future landing feed — with per-call overrides.
 */

export interface SubjectRankingWeights {
    /** Newer meetings rank higher. */
    recency: number;
    /** More-discussed subjects rank higher (discussion length, log-damped). */
    discussion: number;
    /** Subjects from smaller municipalities get a lift (only with several municipalities). */
    smallMunicipality: number;
    /** Council ranks over committee over community (only with several body types). */
    adminBody: number;
    /**
     * A located subject gets a slight edge over an identical unlocated one —
     * deliberately the weakest signal. Unlocated (municipality-wide) subjects
     * are the majority in most δήμοι, so a strong boost here would bury them
     * below the panel's list cap; this is a tiebreaker, not a category filter.
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

export interface SubjectRanking {
    subject: MapSubject;
    score: number;
    components: RankingComponent[];
}

export interface SubjectRankingOptions {
    weights?: Partial<SubjectRankingWeights>;
    /**
     * The discussion-length signal. Defaults to log-damped discussion
     * seconds; pass `s => s.speakerCount` to rank by debate breadth instead.
     */
    discussionMetric?: (subject: MapSubject) => number;
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

/** Default discussion signal: log-damped so a few marathon items don't dwarf the rest. */
function defaultDiscussionMetric(subject: MapSubject): number {
    return Math.log1p(subject.discussionTimeSeconds);
}

/**
 * Scores subjects (unsorted) with a per-subject breakdown — for display and
 * debugging. Use sortByRanking() for the ordered list.
 */
export function rankSubjects(subjects: MapSubject[], options: SubjectRankingOptions = {}): SubjectRanking[] {
    const weights = { ...DEFAULT_SUBJECT_RANKING_WEIGHTS, ...options.weights };
    const discussionMetric = options.discussionMetric ?? defaultDiscussionMetric;

    // Municipality "size" = how many of the ranked subjects it contributes;
    // smaller municipalities (fewer subjects here) get the lift.
    const cityCounts = new Map<string, number>();
    for (const subject of subjects) {
        cityCounts.set(subject.cityId, (cityCounts.get(subject.cityId) ?? 0) + 1);
    }

    const recency = zScores(subjects.map(s => (s.meetingDate ? new Date(s.meetingDate).getTime() : null)));
    const discussion = zScores(subjects.map(discussionMetric));
    const smallMunicipality = zScores(subjects.map(s => -(cityCounts.get(s.cityId) ?? 0)));
    const adminBody = zScores(subjects.map(s => (s.adminBodyType ? ADMIN_BODY_TIER[s.adminBodyType] : null)));

    return subjects.map((subject, index) => {
        const locationSignal = subject.anchor ? 1 : 0;
        const components: RankingComponent[] = [
            { key: 'recency', weight: weights.recency, signal: recency[index], contribution: weights.recency * recency[index] },
            { key: 'discussion', weight: weights.discussion, signal: discussion[index], contribution: weights.discussion * discussion[index] },
            { key: 'smallMunicipality', weight: weights.smallMunicipality, signal: smallMunicipality[index], contribution: weights.smallMunicipality * smallMunicipality[index] },
            { key: 'adminBody', weight: weights.adminBody, signal: adminBody[index], contribution: weights.adminBody * adminBody[index] },
            { key: 'location', weight: weights.location, signal: locationSignal, contribution: weights.location * locationSignal },
        ];
        const score = components.reduce((sum, component) => sum + component.contribution, 0);
        return { subject, score, components };
    });
}

/** Subjects ranked best-first, with each one's score breakdown. Ties keep input order (stable). */
export function sortByRanking(subjects: MapSubject[], options?: SubjectRankingOptions): SubjectRanking[] {
    return rankSubjects(subjects, options)
        .map((ranking, index) => ({ ranking, index }))
        .sort((a, b) => b.ranking.score - a.ranking.score || a.index - b.index)
        .map(entry => entry.ranking);
}
