/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn(),
    validateBearerAuth: jest.fn().mockResolvedValue(false),
}));
jest.mock('@/lib/db/cities', () => ({
    createCity: jest.fn(),
    getCities: jest.fn().mockResolvedValue([]),
    updateCityGeometry: jest.fn(),
}));
jest.mock('@/lib/db/citiesAdmin', () => ({ getAllCitiesAsServiceKey: jest.fn() }));
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn() }));

import { GET } from '@/app/api/cities/route';
import { getCities } from '@/lib/db/cities';

const mockGetCities = getCities as jest.MockedFunction<typeof getCities>;

const get = (query: string) => GET(new NextRequest(`http://localhost/api/cities${query}`));

describe('GET /api/cities includeUnlisted', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['', false],
        ['?includeUnlisted=true', true],
        ['?includeUnlisted=false', false],
        ['?includeUnlisted=1', true],
        ['?includeUnlisted=yes', true],
        ['?includeUnlisted=0', false],
    ])('%s reads as %s', async (query, expected) => {
        const response = await get(query);
        expect(response.status).toBe(200);
        expect(mockGetCities).toHaveBeenCalledWith({ includeNonPublic: expected });
    });

    it('refuses a value outside the stringbool lists', async () => {
        const response = await get('?includeUnlisted=maybe');
        expect(response.status).toBe(400);
        expect(mockGetCities).not.toHaveBeenCalled();
    });
});
