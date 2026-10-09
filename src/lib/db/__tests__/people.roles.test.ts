/** @jest-environment node */

const mockGetRoleLimitForCity = jest.fn();
const mockPersonCreate = jest.fn();

jest.mock('../prisma', () => ({ __esModule: true, default: { person: { create: (...args: unknown[]) => mockPersonCreate(...args) } } }));
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    getRoleLimitForCity: (...args: unknown[]) => mockGetRoleLimitForCity(...args),
}));

jest.mock('@/lib/db/personImage', () => ({ rolesOfPerson: jest.fn(), rolesWithBodyType: jest.fn(), withPersonImageAuthorized: jest.fn() }));

import { createPerson } from '../people';

const person = (roles: { cityId?: string | null; partyId?: string | null; administrativeBodyId?: string | null }[]) => ({
    cityId: 'chania', name: 'Μαρία', name_en: 'Maria', name_short: 'Μ.', name_short_en: 'M.', image: null, profileUrl: null,
    roles: roles.map(role => ({ cityId: null, partyId: null, administrativeBodyId: null, name: null, name_en: null, isHead: false, startDate: null, endDate: null, electedOrder: null, ...role })),
});

beforeEach(() => {
    jest.clearAllMocks();
    mockPersonCreate.mockResolvedValue({ id: 'p1' });
});

/**
 * The Server Actions apply the rules of the people routes to a body admin
 * (#828): a direct call cannot store what a route refuses.
 */
describe('createPerson under the role limit of a body admin', () => {
    beforeEach(() => mockGetRoleLimitForCity.mockResolvedValue(new Set(['youth'])));

    it('writes a role on a held body', async () => {
        await createPerson(person([{ administrativeBodyId: 'youth' }]));
        expect(mockPersonCreate).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a party role', [{ administrativeBodyId: 'youth', partyId: 'party' }]],
        ['a city-level role', [{ cityId: 'chania' }]],
        ['a role on a body the admin does not hold', [{ administrativeBodyId: 'council' }]],
        ['a role of another city', [{ administrativeBodyId: 'youth', cityId: 'argos' }]],
        ['no role at all', []],
    ])('refuses %s', async (_name, roles) => {
        await expect(createPerson(person(roles))).rejects.toThrow('Not authorized');
        expect(mockPersonCreate).not.toHaveBeenCalled();
    });

    it('asks nothing of a city admin', async () => {
        mockGetRoleLimitForCity.mockResolvedValue(null);
        await createPerson(person([{ partyId: 'party' }]));
        expect(mockPersonCreate).toHaveBeenCalledTimes(1);
    });
});
