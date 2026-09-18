/** @jest-environment node */
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));
const mockGetCouncilQrStrips = jest.fn();
jest.mock('@/lib/admin/councilQrStrips', () => ({
    getCouncilQrStrips: (...args: unknown[]) => mockGetCouncilQrStrips(...args),
}));

import { GET } from '../route';

const call = (cityId = 'chania') => GET(new Request(`https://opencouncil.gr/api/admin/cities/${cityId}/qr-strips`), {
    params: Promise.resolve({ cityId }),
});

beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockGetCouncilQrStrips.mockReset();
});

describe('GET /api/admin/cities/[cityId]/qr-strips', () => {
    it('refuses anyone who is not a superadmin, before building any code', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        expect((await call()).status).toBe(401);
        mockGetCurrentUser.mockResolvedValue({ id: 'city-admin', isSuperAdmin: false, administers: [{ cityId: 'chania' }] });
        expect((await call()).status).toBe(401);
        expect(mockGetCouncilQrStrips).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown city', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'admin', isSuperAdmin: true });
        mockGetCouncilQrStrips.mockResolvedValue(null);
        expect((await call('nowhere')).status).toBe(404);
    });

    it('returns the strips and forbids caching, since every call mints new codes', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'admin', isSuperAdmin: true });
        const strips = { cityName: 'Χανιά', people: [], texts: {} };
        mockGetCouncilQrStrips.mockResolvedValue(strips);
        const response = await call();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual(strips);
        expect(mockGetCouncilQrStrips).toHaveBeenCalledWith('chania');
    });
});
