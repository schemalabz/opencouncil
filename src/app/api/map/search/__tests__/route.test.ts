/** @jest-environment node */
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/search/core', () => ({ searchSubjectsInRealm: jest.fn() }));
jest.mock('@/lib/landing/landingCore', () => ({ SUBJECT_DOT_THRESHOLD: 300 }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
// The real parser, so the route is tested with the rules the map endpoints use.
jest.mock('@/lib/db/subject', () => ({
    ...jest.requireActual('@/lib/db/subject'),
    getMapSubjects: jest.fn().mockResolvedValue([]),
    getGeneralSubjects: jest.fn().mockResolvedValue([]),
}));

import { GET } from '../route';
import { searchSubjectsInRealm } from '@/lib/search/core';

const searchMock = searchSubjectsInRealm as jest.Mock;
const NOW = '2026-10-05T14:03:12.000Z';

const get = (qs: string) => GET(new Request(`http://localhost/api/map/search?q=${encodeURIComponent('πάρκα')}&${qs}`));
const sent = () => searchMock.mock.calls[0][0];

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(NOW));
    searchMock.mockResolvedValue({ hits: [], total: 0, dropped: 0, derivedFilters: {} });
});
afterEach(() => jest.useRealTimers());

describe('GET /api/map/search filters', () => {
    it('searches the body types the map URL names, without the junk', async () => {
        await get('bodyType=committee,foo');

        expect(sent().administrativeBodyTypes).toEqual(['committee']);
    });

    // A malformed bound is dropped like an unknown body type: passed on, it
    // reached Elasticsearch as a range it rejects, a 500 and an alert.
    it('drops a malformed date bound and keeps the valid one', async () => {
        await get('dateFrom=abc&dateTo=2026-02-01');

        expect(sent().dateRange).toEqual({ start: '1970-01-01', end: '2026-02-01' });
    });

    it('sets no date range when both bounds are malformed', async () => {
        await get('dateFrom=abc&dateTo=2026-02-31');

        expect(sent().dateRange).toBeUndefined();
    });

    // The map's own list endpoints stop at the current moment.
    it('ends a range with only a start at the current moment', async () => {
        await get('dateFrom=2026-01-01');

        expect(sent().dateRange).toEqual({ start: '2026-01-01', end: NOW });
    });
});

describe('GET /api/map/search extract flag', () => {
    it.each([
        ['', true],
        ['extract=', false],
        ['extract=false', false],
        ['extract=0', false],
        ['extract=true', true],
        ['extract=maybe', true],
    ])('reads %p as extractFilters %p', async (qs, expected) => {
        await get(qs);

        expect(sent().config.extractFilters).toBe(expected);
    });
});
