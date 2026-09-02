/** @jest-environment node */

import { getHotSubjectCards, getHotSubjectCardsCached } from '../hotSubjectCards';
import type { HotSubject } from '@/lib/hotSubjects';

const mockGetRecentHotSubjects = jest.fn();
const mockComputeRecentHotSubjects = jest.fn();
jest.mock('@/lib/hotSubjects', () => ({
    getRecentHotSubjects: (...args: unknown[]) => mockGetRecentHotSubjects(...args),
    computeRecentHotSubjects: (...args: unknown[]) => mockComputeRecentHotSubjects(...args),
    getHotSubjectsNearGeohash: jest.fn(),
}));

const mockGetSubjectCardExtras = jest.fn();
jest.mock('@/lib/db/subject', () => ({
    getSubjectCardExtras: (...args: unknown[]) => mockGetSubjectCardExtras(...args),
}));

const mockGetBatchStatisticsForSubjects = jest.fn();
jest.mock('@/lib/statistics', () => ({
    getBatchStatisticsForSubjects: (...args: unknown[]) => mockGetBatchStatisticsForSubjects(...args),
}));

// The cache is a pass-through here; what matters is what the builder puts in the entry.
jest.mock('@/lib/cache', () => ({
    createCache: (fn: () => unknown) => fn,
    bodyFilterKey: () => [],
}));

const person = (id: string) => ({ id, name: id, roles: [] });
const hot = (id: string): HotSubject => ({
    subject: { id, name: id, description: '', topic: null, agendaItemIndex: null, nonAgendaReason: null, _count: { contributions: 2 } },
    meeting: { cityId: 'athens', id: 'm1', name: 'Council', name_en: 'Council', dateTime: new Date('2026-08-01'), administrativeBody: null },
} as unknown as HotSubject);

beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecentHotSubjects.mockResolvedValue([hot('s1')]);
    mockComputeRecentHotSubjects.mockResolvedValue([hot('s1')]);
    mockGetSubjectCardExtras.mockResolvedValue(new Map([['s1', { locationText: 'Χανιά', introducedBy: person('mayor') }]]));
    mockGetBatchStatisticsForSubjects.mockResolvedValue(new Map([['s1', {
        speakingSeconds: 600,
        people: [
            { item: person('a'), speakingSeconds: 100 },
            { item: person('b'), speakingSeconds: 300 },
            { item: person('mayor'), speakingSeconds: 50 },
        ],
        parties: [],
    }]]));
});

describe('getHotSubjectCards', () => {
    it('carries no speakers unless a surface asks for them', async () => {
        const [card] = await getHotSubjectCards('athens', { limit: 5 });
        expect(card.locationText).toBe('Χανιά');
        expect('speakers' in card).toBe(false);
    });

    it('builds the avatar row for a surface that asks: introducer first, then top speakers, no duplicate', async () => {
        const [card] = await getHotSubjectCards('athens', { limit: 5, withSpeakers: true });
        expect(card.speakers?.map((p) => p.id)).toEqual(['mayor', 'b', 'a']);
    });
});

describe('getHotSubjectCardsCached', () => {
    it('never puts speakers in the entry', async () => {
        const [card] = await getHotSubjectCardsCached('athens', { limit: 5 });
        expect('speakers' in card).toBe(false);
    });
});
