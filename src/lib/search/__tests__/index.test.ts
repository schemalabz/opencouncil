/** @jest-environment node */
jest.mock('../core', () => ({ searchInRealm: jest.fn() }));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn() }));

import { searchInRealm } from '../core';
import { search } from '../index';

const searchInRealmMock = searchInRealm as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    searchInRealmMock.mockResolvedValue({ results: [], total: 0, dropped: 0, derivedFilters: {} });
});

// search() is a Server Action, so a browser can call it with any body. A bad
// point reached the Elasticsearch geo query, which rejected it: a 500 and a
// search failure alert.
describe('search() Server Action location', () => {
    it.each([
        { point: { lat: 37.9 }, radiusMeters: 1000 },
        { point: { lat: 37.9, lng: 23.7 }, radiusMeters: -1 },
        { point: { lat: 200, lng: 23.7 }, radiusMeters: 1000 },
    ])('rejects the location %o before it reaches the search', async (location) => {
        await expect(search({ query: 'πάρκα', location } as never)).rejects.toThrow();
        expect(searchInRealmMock).not.toHaveBeenCalled();
    });

    it('passes a valid location to the search', async () => {
        const location = { point: { lat: 37.98, lng: 23.73 }, radiusMeters: 2000 };
        await search({ query: 'πάρκα', location });

        expect(searchInRealmMock.mock.calls[0][0].location).toEqual(location);
    });

    it('searches without a location when none is given', async () => {
        await search({ query: 'πάρκα' });

        expect(searchInRealmMock.mock.calls[0][0].location).toBeUndefined();
    });
});
