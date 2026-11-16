/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
}));
jest.mock('@/lib/db/cities', () => ({
    createCity: jest.fn().mockResolvedValue({ id: 'trikala' }),
    getCities: jest.fn().mockResolvedValue([]),
    updateCityGeometry: jest.fn(),
}));
jest.mock('@/lib/db/citiesAdmin', () => ({ assertDemoAllowed: jest.fn() }));
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/logo.png' }) }));

import { GET, POST } from '@/app/api/cities/route';
import { createCity, getCities } from '@/lib/db/cities';
import { assertDemoAllowed } from '@/lib/db/citiesAdmin';
import { uploadFile } from '@/lib/s3';
import { ConflictError } from '@/lib/api/errors';

const mockGetCities = getCities as jest.MockedFunction<typeof getCities>;

const get = (query: string) => GET(new NextRequest(`http://localhost/api/cities${query}`));

describe('GET /api/cities includeUnlisted', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['', false],
        ['?includeUnlisted=', false],
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

// What CityForm sends for a new city, with the status the test picks.
function post(status: string) {
    const formData = new FormData();
    const fields = {
        id: 'trikala', name: 'Τρίκαλα', name_en: 'Trikala', name_municipality: 'Δήμος Τρικκαίων', name_municipality_en: 'Municipality of Trikala',
        timezone: 'Europe/Athens', authorityType: 'municipality', status, supportsNotifications: 'false', consultationsEnabled: 'false',
        highlightCreationPermission: 'ADMINS_ONLY', language: 'el', realm: 'greece',
    };
    for (const [key, value] of Object.entries(fields)) formData.append(key, value);
    formData.append('logoImage', new File(['x'], 'logo.png', { type: 'image/png' }));
    return POST(new Request('http://localhost/api/cities', { method: 'POST', body: formData }));
}

describe('POST /api/cities demo policy', () => {
    beforeEach(() => jest.clearAllMocks());

    it('checks the realm policy before it creates a city as a demo', async () => {
        expect((await post('demo')).status).toBe(200);
        expect(assertDemoAllowed).toHaveBeenCalledWith({ realm: 'greece' });
        expect(createCity).toHaveBeenCalledWith(expect.objectContaining({ id: 'trikala', status: 'demo' }));
    });

    it('answers 409 with the refusal and uploads nothing', async () => {
        jest.mocked(assertDemoAllowed).mockRejectedValueOnce(new ConflictError('Cannot publish the city as a demo: realm greece already has a supported city (Athens).'));
        const response = await post('demo');
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Cannot publish the city as a demo: realm greece already has a supported city (Athens).' });
        expect(uploadFile).not.toHaveBeenCalled();
        expect(createCity).not.toHaveBeenCalled();
    });

    it('passes a refusal of the write itself through as 409', async () => {
        jest.mocked(createCity).mockRejectedValueOnce(new ConflictError('Cannot publish the city as a demo: realm greece already has a supported city (Athens).'));
        const response = await post('demo');
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Cannot publish the city as a demo: realm greece already has a supported city (Athens).' });
    });

    it('needs no check for a pending city', async () => {
        expect((await post('pending')).status).toBe(200);
        expect(assertDemoAllowed).not.toHaveBeenCalled();
        expect(createCity).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });
});
