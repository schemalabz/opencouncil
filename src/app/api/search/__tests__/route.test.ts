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
        await post({ query: 'πάρκα', adminBodyIds: ['body1'], adminBodyTypes: ['committee'] });

        expect(mockSearch.mock.calls[0][0]).toMatchObject({
            adminBodyIds: ['body1'],
            adminBodyTypes: ['committee'],
        });
    });

    // Regression: the route passed `location` through as it came. The search
    // reads no `location` key, so the filter was validated and then ignored.
    it('passes the location to the search as a filter, with the radius in metres', async () => {
        await post({ query: 'πάρκα', location: { point: { lat: 38, lon: 23.7 }, radius: 2 } });

        const request = mockSearch.mock.calls[0][0];
        expect(request.locationFilter).toEqual({ point: { lat: 38, lon: 23.7 }, radiusMeters: 2000 });
        expect(request).not.toHaveProperty('location');
    });

    it('applies the default radius of 5 km', async () => {
        await post({ query: 'πάρκα', location: { point: { lat: 38, lon: 23.7 } } });

        expect(mockSearch.mock.calls[0][0].locationFilter?.radiusMeters).toBe(5000);
    });

    it('sets no location filter when the request has no location', async () => {
        await post({ query: 'πάρκα' });

        expect(mockSearch.mock.calls[0][0].locationFilter).toBeUndefined();
    });
});
