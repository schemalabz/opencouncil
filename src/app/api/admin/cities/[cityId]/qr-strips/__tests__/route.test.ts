/** @jest-environment node */
const mockWithRight = jest.fn();
jest.mock('@/lib/auth', () => ({ withRight: (...args: unknown[]) => mockWithRight(...args) }));
const mockGetCouncilQrStrips = jest.fn();
jest.mock('@/lib/admin/councilQrStrips', () => ({
    getCouncilQrStrips: (...args: unknown[]) => mockGetCouncilQrStrips(...args),
}));

import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';
import { GET, POST } from '../route';

const call = (cityId = 'chania') => GET(new Request(`https://opencouncil.gr/api/admin/cities/${cityId}/qr-strips`), {
    params: Promise.resolve({ cityId }),
});

/** The gate answers as src/lib/auth does: it passes an admin of the city, or throws. */
const signedOut = () => mockWithRight.mockRejectedValue(new UnauthorizedError());
const adminOfAnotherCity = () => mockWithRight.mockRejectedValue(new ForbiddenError());
const adminOfTheCity = () => mockWithRight.mockResolvedValue(true);

beforeEach(() => {
    mockWithRight.mockReset();
    mockGetCouncilQrStrips.mockReset();
});

describe('GET /api/admin/cities/[cityId]/qr-strips', () => {
    it('refuses anyone who is not an admin of the city, before building any code', async () => {
        signedOut();
        expect((await call()).status).toBe(401);
        adminOfAnotherCity();
        expect((await call()).status).toBe(403);
        expect(mockWithRight).toHaveBeenCalledWith('admin', { cityId: 'chania' });
        expect(mockGetCouncilQrStrips).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown city', async () => {
        adminOfTheCity();
        mockGetCouncilQrStrips.mockResolvedValue(null);
        expect((await call('nowhere')).status).toBe(404);
    });

    it('returns the strips and forbids caching, since every call mints new codes', async () => {
        adminOfTheCity();
        const strips = { cityName: 'Χανιά', people: [], texts: {} };
        mockGetCouncilQrStrips.mockResolvedValue(strips);
        const response = await call();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual(strips);
        // GET is the whole city: no scope reaches the builder.
        expect(mockGetCouncilQrStrips).toHaveBeenCalledWith('chania', undefined);
    });
});

const post = (body: unknown, cityId = 'chania') => POST(
    new Request(`https://opencouncil.gr/api/admin/cities/${cityId}/qr-strips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ cityId }) },
);

describe('POST /api/admin/cities/[cityId]/qr-strips', () => {
    it('refuses anyone who is not an admin of the city before it reads the body', async () => {
        signedOut();
        // A body that would fail validation: a 401, not a 400, says the gate ran first.
        expect((await post('not json')).status).toBe(401);
        adminOfAnotherCity();
        expect((await post({ personIds: ['p1'] })).status).toBe(403);
        expect(mockGetCouncilQrStrips).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that names no people', async () => {
        adminOfTheCity();
        expect((await post('not json')).status).toBe(400);
        expect((await post({ personIds: [] })).status).toBe(400);
        expect((await post({ personIds: 'p1' })).status).toBe(400);
        expect(mockGetCouncilQrStrips).not.toHaveBeenCalled();
    });

    it('builds the strips for the people it names', async () => {
        adminOfTheCity();
        mockGetCouncilQrStrips.mockResolvedValue({ cityName: 'Χανιά', people: [], texts: {} });
        const response = await post({ personIds: ['p1', 'p2'] });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mockGetCouncilQrStrips).toHaveBeenCalledWith('chania', ['p1', 'p2']);
    });
});
