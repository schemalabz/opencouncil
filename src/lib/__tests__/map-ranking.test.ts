import { rankSubjects, sortByRanking, DEFAULT_SUBJECT_RANKING_WEIGHTS } from '../map/ranking';
import type { MapSubject } from '../map/types';
import type { AdministrativeBodyType } from '@prisma/client';

let counter = 0;
function subject(overrides: Partial<MapSubject> = {}): MapSubject {
    counter += 1;
    return {
        id: overrides.id ?? `s${counter}`,
        name: 'subject',
        description: null,
        cityId: 'athens',
        cityName: 'Αθήνα',
        councilMeetingId: 'm1',
        meetingDate: '2026-01-01T00:00:00.000Z',
        meetingName: null,
        locationText: null,
        adminBodyName: null,
        adminBodyType: null,
        topicId: null,
        topicName: null,
        topicColor: '#627BBC',
        topicIcon: null,
        discussionTimeSeconds: 0,
        speakerCount: 0,
        importance: 'minor',
        geometry: null,
        anchor: null,
        ...overrides,
    };
}

const order = (subjects: MapSubject[]) => sortByRanking(subjects).map(r => r.subject.id);

describe('rankSubjects', () => {
    it('returns one ranking per subject with the five components', () => {
        const rankings = rankSubjects([subject(), subject()]);
        expect(rankings).toHaveLength(2);
        expect(rankings[0].components.map(c => c.key)).toEqual([
            'recency', 'discussion', 'smallMunicipality', 'adminBody', 'location',
        ]);
    });

    it('scores an empty set as nothing', () => {
        expect(rankSubjects([])).toEqual([]);
    });

    it('sums weighted contributions into the score', () => {
        const [ranking] = rankSubjects([subject({ anchor: [23, 38] })]);
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
        const quiet = subject({ id: 'quiet', discussionTimeSeconds: 10 });
        const loud = subject({ id: 'loud', discussionTimeSeconds: 5000 });
        expect(order([quiet, loud])[0]).toBe('loud');
    });

    it('uses a log-damped discussion signal (diminishing returns)', () => {
        // Equal geometric steps (10× each) → equal log-signal steps; raw seconds
        // would let the biggest jump dominate.
        const set = [10, 100, 1000].map((seconds, i) => subject({ id: `d${i}`, discussionTimeSeconds: seconds }));
        const discussionSignal = (id: string, opts?: Parameters<typeof rankSubjects>[1]) =>
            rankSubjects(set, opts).find(r => r.subject.id === id)!.components.find(c => c.key === 'discussion')!.signal;

        const logLowStep = discussionSignal('d1') - discussionSignal('d0');
        const logHighStep = discussionSignal('d2') - discussionSignal('d1');
        expect(logHighStep).toBeCloseTo(logLowStep, 1);

        const raw = (id: string) => discussionSignal(id, { discussionMetric: s => s.discussionTimeSeconds });
        const rawLowStep = raw('d1') - raw('d0');
        const rawHighStep = raw('d2') - raw('d1');
        expect(rawHighStep).toBeGreaterThan(rawLowStep * 2);
    });
});

describe('municipality boost', () => {
    it('has no effect when every subject is from one municipality', () => {
        const a = subject({ id: 'a', cityId: 'athens', discussionTimeSeconds: 100 });
        const b = subject({ id: 'b', cityId: 'athens', discussionTimeSeconds: 50 });
        const muniContribution = rankSubjects([a, b]).map(r =>
            r.components.find(c => c.key === 'smallMunicipality')!.contribution);
        expect(muniContribution).toEqual([0, 0]);
    });

    it('lifts a subject from the smaller municipality when several are present', () => {
        // big city: 3 subjects, small city: 1 — all else equal
        const big = [1, 2, 3].map(i => subject({ id: `big${i}`, cityId: 'athens' }));
        const small = subject({ id: 'small', cityId: 'samothraki' });
        const smallRanking = rankSubjects([...big, small]).find(r => r.subject.id === 'small')!;
        const bigRanking = rankSubjects([...big, small]).find(r => r.subject.id === 'big1')!;
        const muni = (r: typeof smallRanking) => r.components.find(c => c.key === 'smallMunicipality')!.contribution;
        expect(muni(smallRanking)).toBeGreaterThan(muni(bigRanking));
    });
});

describe('admin body boost', () => {
    const withBody = (id: string, type: AdministrativeBodyType) => subject({ id, adminBodyType: type });

    it('has no effect when every subject shares one body type', () => {
        const subjects = [withBody('a', 'council'), withBody('b', 'council')];
        const contributions = rankSubjects(subjects).map(r =>
            r.components.find(c => c.key === 'adminBody')!.contribution);
        expect(contributions).toEqual([0, 0]);
    });

    it('ranks council over committee over community when several body types are present', () => {
        const council = withBody('council', 'council');
        const committee = withBody('committee', 'committee');
        const community = withBody('community', 'community');
        const body = (id: string, subjects: MapSubject[]) =>
            rankSubjects(subjects).find(r => r.subject.id === id)!.components.find(c => c.key === 'adminBody')!.contribution;
        const set = [council, committee, community];
        expect(body('council', set)).toBeGreaterThan(body('committee', set));
        expect(body('committee', set)).toBeGreaterThan(body('community', set));
    });
});

describe('location boost', () => {
    it('lifts a located subject over an identical unlocated one', () => {
        const located = subject({ id: 'located', anchor: [23.7, 37.9] });
        const unlocated = subject({ id: 'unlocated', anchor: null });
        expect(order([unlocated, located])[0]).toBe('located');
        const [ranking] = rankSubjects([located]);
        expect(ranking.components.find(c => c.key === 'location')!.contribution)
            .toBeCloseTo(DEFAULT_SUBJECT_RANKING_WEIGHTS.location, 10);
    });
});

describe('weight overrides', () => {
    it('lets callers flip the emphasis from discussion to recency', () => {
        const recentQuiet = subject({ id: 'recentQuiet', meetingDate: '2026-06-01T00:00:00.000Z', discussionTimeSeconds: 10 });
        const staleLoud = subject({ id: 'staleLoud', meetingDate: '2025-01-01T00:00:00.000Z', discussionTimeSeconds: 5000 });

        const discussionFirst = sortByRanking([recentQuiet, staleLoud], { weights: { recency: 0, discussion: 5 } });
        expect(discussionFirst[0].subject.id).toBe('staleLoud');

        const recencyFirst = sortByRanking([recentQuiet, staleLoud], { weights: { recency: 5, discussion: 0 } });
        expect(recencyFirst[0].subject.id).toBe('recentQuiet');
    });

    it('honors a custom discussion metric (speaker breadth)', () => {
        const fewSpeakersLongTime = subject({ id: 'long', discussionTimeSeconds: 5000, speakerCount: 1 });
        const manySpeakers = subject({ id: 'many', discussionTimeSeconds: 100, speakerCount: 20 });
        const byBreadth = sortByRanking([fewSpeakersLongTime, manySpeakers], {
            weights: { recency: 0, discussion: 1, smallMunicipality: 0, adminBody: 0, location: 0 },
            discussionMetric: s => s.speakerCount,
        });
        expect(byBreadth[0].subject.id).toBe('many');
    });
});
