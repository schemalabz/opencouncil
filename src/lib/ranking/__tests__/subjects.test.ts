import {
    rankSubjects,
    rankAndSortSubjects,
    sortByRanking,
    DEFAULT_SUBJECT_RANKING_WEIGHTS,
    type RankableSubject,
} from '../subjects';
import type { AdministrativeBodyType } from '@prisma/client';

// Test items carry an `id` and satisfy RankableSubject, so `adapt` is identity.
type TestSubject = RankableSubject & { id: string };

let counter = 0;
function subject(overrides: Partial<TestSubject> = {}): TestSubject {
    counter += 1;
    return {
        id: overrides.id ?? `s${counter}`,
        cityId: 'athens',
        meetingDate: '2026-01-01T00:00:00.000Z',
        adminBodyType: null,
        contributionCount: 0,
        hasLocation: false,
        ...overrides,
    };
}

const identity = (s: TestSubject): RankableSubject => s;
const rank = (subjects: TestSubject[], options?: Parameters<typeof rankSubjects>[2]) =>
    rankSubjects(subjects, identity, options);
const order = (subjects: TestSubject[], options?: Parameters<typeof sortByRanking>[2]) =>
    sortByRanking(subjects, identity, options).map(s => s.id);

describe('rankSubjects', () => {
    it('returns one ranking per subject with the five components', () => {
        const rankings = rank([subject(), subject()]);
        expect(rankings).toHaveLength(2);
        expect(rankings[0].components.map(c => c.key)).toEqual([
            'recency', 'discussion', 'smallMunicipality', 'adminBody', 'location',
        ]);
    });

    it('scores an empty set as nothing', () => {
        expect(rank([])).toEqual([]);
    });

    it('sums weighted contributions into the score', () => {
        const [ranking] = rank([subject({ hasLocation: true })]);
        const expected = ranking.components.reduce((sum, c) => sum + c.contribution, 0);
        expect(ranking.score).toBeCloseTo(expected, 10);
    });
});

describe('recency and discussion', () => {
    it('ranks the more recent subject first when discussion is equal', () => {
        const older = subject({ id: 'older', meetingDate: '2025-06-01T00:00:00.000Z' });
        const newer = subject({ id: 'newer', meetingDate: '2026-06-01T00:00:00.000Z' });
        expect(order([older, newer])[0]).toBe('newer');
    });

    it('ranks the more-discussed subject first when recency is equal', () => {
        const quiet = subject({ id: 'quiet', contributionCount: 1 });
        const loud = subject({ id: 'loud', contributionCount: 50 });
        expect(order([quiet, loud])[0]).toBe('loud');
    });

    it('treats a missing meeting date as neutral (zero signal)', () => {
        const dated = subject({ id: 'dated', meetingDate: '2026-06-01T00:00:00.000Z' });
        const undatedA = subject({ id: 'undatedA', meetingDate: null });
        const undatedB = subject({ id: 'undatedB', meetingDate: null });
        const recency = (id: string) =>
            rank([dated, undatedA, undatedB]).find(r => r.item.id === id)!
                .components.find(c => c.key === 'recency')!.signal;
        expect(recency('undatedA')).toBe(0);
        expect(recency('undatedB')).toBe(0);
    });

    it('uses a log-damped discussion signal (diminishing returns)', () => {
        // Equal geometric steps (10× each) → equal log-signal steps; raw counts
        // would let the biggest jump dominate.
        const set = [9, 99, 999].map((count, i) => subject({ id: `d${i}`, contributionCount: count }));
        const discussionSignal = (id: string) =>
            rank(set).find(r => r.item.id === id)!.components.find(c => c.key === 'discussion')!.signal;

        const lowStep = discussionSignal('d1') - discussionSignal('d0');
        const highStep = discussionSignal('d2') - discussionSignal('d1');
        expect(highStep).toBeCloseTo(lowStep, 1);
    });
});

describe('municipality boost', () => {
    it('has no effect when every subject is from one municipality', () => {
        const a = subject({ id: 'a', cityId: 'athens', contributionCount: 10 });
        const b = subject({ id: 'b', cityId: 'athens', contributionCount: 5 });
        const muniContribution = rank([a, b]).map(r =>
            r.components.find(c => c.key === 'smallMunicipality')!.contribution);
        expect(muniContribution).toEqual([0, 0]);
    });

    it('lifts a subject from the smaller municipality when several are present', () => {
        // big city: 3 subjects, small city: 1 — all else equal
        const big = [1, 2, 3].map(i => subject({ id: `big${i}`, cityId: 'athens' }));
        const small = subject({ id: 'small', cityId: 'samothraki' });
        const set = [...big, small];
        const muni = (id: string) =>
            rank(set).find(r => r.item.id === id)!.components.find(c => c.key === 'smallMunicipality')!.contribution;
        expect(muni('small')).toBeGreaterThan(muni('big1'));
    });
});

describe('admin body boost', () => {
    const withBody = (id: string, type: AdministrativeBodyType) => subject({ id, adminBodyType: type });

    it('has no effect when every subject shares one body type', () => {
        const subjects = [withBody('a', 'council'), withBody('b', 'council')];
        const contributions = rank(subjects).map(r =>
            r.components.find(c => c.key === 'adminBody')!.contribution);
        expect(contributions).toEqual([0, 0]);
    });

    it('ranks council over committee over community when several body types are present', () => {
        const set = [withBody('council', 'council'), withBody('committee', 'committee'), withBody('community', 'community')];
        const body = (id: string) =>
            rank(set).find(r => r.item.id === id)!.components.find(c => c.key === 'adminBody')!.contribution;
        expect(body('council')).toBeGreaterThan(body('committee'));
        expect(body('committee')).toBeGreaterThan(body('community'));
    });
});

describe('location boost', () => {
    it('lifts a located subject over an identical unlocated one', () => {
        const located = subject({ id: 'located', hasLocation: true });
        const unlocated = subject({ id: 'unlocated', hasLocation: false });
        expect(order([unlocated, located])[0]).toBe('located');
        const [ranking] = rank([located]);
        expect(ranking.components.find(c => c.key === 'location')!.contribution)
            .toBeCloseTo(DEFAULT_SUBJECT_RANKING_WEIGHTS.location, 10);
    });
});

describe('weight overrides', () => {
    it('lets callers flip the emphasis from discussion to recency', () => {
        const recentQuiet = subject({ id: 'recentQuiet', meetingDate: '2026-06-01T00:00:00.000Z', contributionCount: 1 });
        const staleLoud = subject({ id: 'staleLoud', meetingDate: '2025-01-01T00:00:00.000Z', contributionCount: 50 });

        const discussionFirst = order([recentQuiet, staleLoud], { weights: { recency: 0, discussion: 5 } });
        expect(discussionFirst[0]).toBe('staleLoud');

        const recencyFirst = order([recentQuiet, staleLoud], { weights: { recency: 5, discussion: 0 } });
        expect(recencyFirst[0]).toBe('recentQuiet');
    });

    it('zeroing the location weight removes the located-subject edge (tie keeps input order)', () => {
        const located = subject({ id: 'located', hasLocation: true });
        const unlocated = subject({ id: 'unlocated', hasLocation: false });
        // With location weight 0 and every other signal collapsed, scores tie → stable input order.
        expect(order([unlocated, located], { weights: { location: 0 } })).toEqual(['unlocated', 'located']);
    });
});

describe('stable ordering', () => {
    it('keeps input order for fully-tied subjects', () => {
        const tied = [subject({ id: 'first' }), subject({ id: 'second' }), subject({ id: 'third' })];
        expect(order(tied)).toEqual(['first', 'second', 'third']);
    });

    it('rankAndSortSubjects returns best-first with breakdowns', () => {
        const quiet = subject({ id: 'quiet', contributionCount: 1 });
        const loud = subject({ id: 'loud', contributionCount: 50 });
        const ranked = rankAndSortSubjects([quiet, loud], identity);
        expect(ranked.map(r => r.item.id)).toEqual(['loud', 'quiet']);
        expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });
});
