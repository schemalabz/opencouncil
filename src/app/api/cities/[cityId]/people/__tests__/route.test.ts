/** @jest-environment node */
jest.mock('@/lib/db/people', () => ({ createPerson: jest.fn(), listPeopleOfCity: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/auth', () => ({ getRoleLimitForCity: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn() }));
jest.mock('@/lib/db/personRoles', () => ({ validatePersonRoles: jest.fn() }));
jest.mock('@/lib/db/personImage', () => ({ rolesWithBodyType: jest.fn(), withPersonImageAuthorized: jest.fn() }));

import { GET } from '@/app/api/cities/[cityId]/people/route';
import { listPeopleOfCity } from '@/lib/db/people';

const mockList = listPeopleOfCity as jest.MockedFunction<typeof listPeopleOfCity>;

const get = (query: string) => GET(
    new Request(`http://localhost/api/cities/chania/people${query}`),
    { params: Promise.resolve({ cityId: 'chania' }) },
);

describe('GET /api/cities/[cityId]/people tier (#829)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lists the primary tier unless the caller asks for a tier', async () => {
        expect((await get('')).status).toBe(200);
        expect(mockList).toHaveBeenLastCalledWith('chania', { scope: { tier: undefined } });
        for (const tier of ['primary', 'secondary', 'all'] as const) {
            expect((await get(`?tier=${tier}`)).status).toBe(200);
            expect(mockList).toHaveBeenLastCalledWith('chania', { scope: { tier } });
        }
    });

    it('refuses an unknown tier', async () => {
        const response = await get('?tier=youth');
        expect(response.status).toBe(400);
        expect(mockList).not.toHaveBeenCalled();
    });
});
