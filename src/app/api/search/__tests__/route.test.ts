/** @jest-environment node */
jest.mock('@/lib/search', () => ({
    search: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { search } from '@/lib/search';

const mockSearch = search as jest.MockedFunction<typeof search>;

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
}));

describe('POST /api/search', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSearch.mockResolvedValue({ results: [], total: 0, dropped: 0, derivedFilters: {} });
    });

    it('passes the administrative body filters to the search', async () => {
        await post({ query: 'πάρκα', administrativeBodyIds: ['body1'], administrativeBodyTypes: ['committee'] });

        expect(mockSearch.mock.calls[0][0]).toMatchObject({
            administrativeBodyIds: ['body1'],
            administrativeBodyTypes: ['committee'],
        });
    });

    // Regression: the API's `location` once reached a search field of another
    // name, so the filter was validated and then ignored. The two now share
    // one name and one unit, and the route passes the filter through.
    it('passes the location to the search unchanged', async () => {
        await post({ query: 'πάρκα', location: { point: { lat: 38, lng: 23.7 }, radiusMeters: 2000 } });

        expect(mockSearch.mock.calls[0][0].location).toEqual({ point: { lat: 38, lng: 23.7 }, radiusMeters: 2000 });
    });

    it('applies the default radius of 5000 metres', async () => {
        await post({ query: 'πάρκα', location: { point: { lat: 38, lng: 23.7 } } });

        expect(mockSearch.mock.calls[0][0].location?.radiusMeters).toBe(5000);
    });

    it('sets no location when the request has none', async () => {
        await post({ query: 'πάρκα' });

        expect(mockSearch.mock.calls[0][0].location).toBeUndefined();
    });

    it('turns the paging fields into the search config and passes nothing else', async () => {
        await post({ query: 'πάρκα', page: 3, pageSize: 20, detailed: true });

        const request = mockSearch.mock.calls[0][0];
        expect(request.config).toMatchObject({ from: 40, size: 20, detailed: true });
        expect(request).not.toHaveProperty('page');
        expect(request).not.toHaveProperty('pageSize');
        expect(request).not.toHaveProperty('detailed');
    });

    // A point does not replace a period named in the text: "πάρκα το 2025" with
    // a point must still search 2025, so the extraction stays on.
    it('reads the query text for filters when the request has a location', async () => {
        await post({ query: 'πάρκα το 2025', location: { point: { lat: 37.98, lng: 23.73 }, radiusMeters: 5000 } });

        expect(mockSearch.mock.calls[0][0].config?.extractFilters).toBeUndefined();
    });
});
