/** @jest-environment node */

const mockGetCouncilMeetingsForCityPublicCached = jest.fn();
const mockFilterLocationIdsWithinRadius = jest.fn();
const mockGetLocationDistancesFromPoint = jest.fn();

jest.mock('../cache', () => ({
    __esModule: true,
    createCache: (fn: () => unknown) => fn,
    getCouncilMeetingsForCityPublicCached: (...args: unknown[]) =>
        mockGetCouncilMeetingsForCityPublicCached(...args),
}));

jest.mock('../db/meetings', () => ({
    __esModule: true,
    getCouncilMeetingsForCity: jest.fn(),
}));

jest.mock('../db/location', () => ({
    __esModule: true,
    filterLocationIdsWithinRadius: (...args: unknown[]) => mockFilterLocationIdsWithinRadius(...args),
    getLocationDistancesFromPoint: (...args: unknown[]) => mockGetLocationDistancesFromPoint(...args),
}));

import { getRecentHotSubjects, getHotSubjectsNearPoint, withDistances, type HotSubject } from '../hotSubjects';

const CENTER: [number, number] = [23.72, 37.98];

/**
 * Minimal meeting/subject shapes for the ranker. dateTime deliberately allows
 * a string: unstable_cache revives cached Dates as ISO strings, and the
 * ranking must survive both (regression for the 500 this caused in the MCP
 * nearby tool).
 */
function meeting(
    id: string,
    dateTime: Date | string,
    subjects: Array<{ id: string; locationId: string | null; contributions?: number; withdrawn?: boolean }>,
) {
    return {
        id,
        cityId: 'athens',
        dateTime,
        name: `Συνεδρίαση ${id}`,
        administrativeBody: null,
        subjects: subjects.map(subject => ({
            id: subject.id,
            name: subject.id,
            description: '',
            locationId: subject.locationId,
            topic: null,
            speakerSegments: [],
            withdrawn: subject.withdrawn ?? false,
            _count: { contributions: subject.contributions ?? 1 },
        })),
    };
}

describe('getRecentHotSubjects', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('leaves out subjects nobody spoke to, and withdrawn ones', async () => {
        // Both would otherwise rank on recency alone, and a subject with no
        // discussion time behind it makes nonsense of any comparison drawn
        // against it.
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([
            meeting('m1', new Date('2026-08-01T18:00:00Z'), [
                { id: 'debated', locationId: null, contributions: 4 },
                { id: 'untouched', locationId: null, contributions: 0 },
                { id: 'withdrawn', locationId: null, contributions: 9, withdrawn: true },
            ]),
        ]);

        const hot = await getRecentHotSubjects('athens', { limit: 10 });

        expect(hot.map(h => h.subject.id)).toEqual(['debated']);
    });

    it('returns nothing rather than falling back when the window holds no discussion', async () => {
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([
            meeting('m1', new Date('2026-08-01T18:00:00Z'), [
                { id: 'untouched', locationId: null, contributions: 0 },
            ]),
        ]);

        await expect(getRecentHotSubjects('athens', { limit: 10 })).resolves.toEqual([]);
    });
});

describe('getHotSubjectsNearPoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('orders in-radius subjects first, fills with municipality-wide ones, and drops located subjects outside the radius', async () => {
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([
            meeting('m1', new Date('2026-08-01T18:00:00Z'), [
                { id: 'inRadius', locationId: 'loc-in' },
                { id: 'outOfRadius', locationId: 'loc-out' },
                { id: 'cityWide', locationId: null },
            ]),
        ]);
        // Only loc-in is within the radius: loc-out must land in NEITHER
        // group — located but far away is not "municipality-wide".
        mockFilterLocationIdsWithinRadius.mockResolvedValue(['loc-in']);

        const { subjects, meetingsScanned, oldestMeetingDate } = await getHotSubjectsNearPoint(
            'athens',
            CENTER,
            1000,
            10
        );

        expect(subjects.map(s => s.subject.id)).toEqual(['inRadius', 'cityWide']);
        expect(meetingsScanned).toBe(1);
        expect(oldestMeetingDate).toEqual(new Date('2026-08-01T18:00:00Z'));
    });

    it('keeps the near-before-wide partition when dates arrive as cache-revived strings', async () => {
        // Both meetings carry ISO strings, as unstable_cache returns on a hit.
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([
            meeting('new', '2026-08-01T18:00:00.000Z', [
                { id: 'nearNew', locationId: 'loc-a' },
                { id: 'wideNew', locationId: null },
            ]),
            meeting('old', '2026-06-01T18:00:00.000Z', [
                { id: 'nearOld', locationId: 'loc-b' },
                { id: 'wideOld', locationId: null },
            ]),
        ]);
        mockFilterLocationIdsWithinRadius.mockResolvedValue(['loc-a', 'loc-b']);

        const { subjects, oldestMeetingDate } = await getHotSubjectsNearPoint('athens', CENTER, 500, 10);

        // Near group strictly before the wide group. Note this fixture is fed
        // newest-first (as getCouncilMeetingsForCity returns it, dateTime desc),
        // so it deliberately does NOT discriminate recency — the test below does.
        expect(subjects.map(s => s.subject.id)).toEqual(['nearNew', 'nearOld', 'wideNew', 'wideOld']);
        expect(oldestMeetingDate).toBe('2026-06-01T18:00:00.000Z');
    });

    it('orders by recency rather than by the order meetings arrive in', async () => {
        // Deliberately fed oldest-first — the opposite of production ordering —
        // so the assertion fails if the ranker degrades to a pass-through or the
        // recency signal goes inert. (oldestMeetingDate is not asserted here: it
        // reads the last element, which is only the oldest for sorted input.)
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([
            meeting('old', new Date('2026-06-01T18:00:00Z'), [{ id: 'olderSubject', locationId: 'loc-b' }]),
            meeting('new', new Date('2026-08-01T18:00:00Z'), [{ id: 'newerSubject', locationId: 'loc-a' }]),
        ]);
        mockFilterLocationIdsWithinRadius.mockResolvedValue(['loc-a', 'loc-b']);

        const { subjects } = await getHotSubjectsNearPoint('athens', CENTER, 500, 10);

        expect(subjects.map(s => s.subject.id)).toEqual(['newerSubject', 'olderSubject']);
    });

    it('propagates radius-query failures instead of degrading to municipality-wide-only', async () => {
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([
            meeting('m1', new Date('2026-08-01T18:00:00Z'), [{ id: 's1', locationId: 'loc-1' }]),
        ]);
        mockFilterLocationIdsWithinRadius.mockRejectedValue(new Error('db down'));

        await expect(getHotSubjectsNearPoint('athens', CENTER, 500, 10)).rejects.toThrow('db down');
    });
});

describe('withDistances', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const items = meeting('m1', new Date('2026-08-01T18:00:00Z'), [
        { id: 'located', locationId: 'loc-1' },
        { id: 'wide', locationId: null },
    ]).subjects.map(subject => ({ subject, meeting: {} })) as unknown as HotSubject[];

    it('attaches distances to located subjects and null to municipality-wide ones — including a distance of exactly 0', async () => {
        mockGetLocationDistancesFromPoint.mockResolvedValue(new Map([['loc-1', 0]]));

        const ranked = await withDistances(items, CENTER);

        expect(ranked.map(r => r.distanceMeters)).toEqual([0, null]);
        expect(mockGetLocationDistancesFromPoint).toHaveBeenCalledWith(['loc-1'], CENTER);
    });

    it('propagates distance-query failures instead of nulling every distance', async () => {
        mockGetLocationDistancesFromPoint.mockRejectedValue(new Error('db down'));

        await expect(withDistances(items, CENTER)).rejects.toThrow('db down');
    });
});
