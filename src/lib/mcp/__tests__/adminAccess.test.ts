/** @jest-environment node */

const mockUserFindUnique = jest.fn();
const mockMeetingFindUnique = jest.fn();
const mockBodyFindUnique = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        councilMeeting: { findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args) },
        administrativeBody: { findUnique: (...args: unknown[]) => mockBodyFindUnique(...args) },
    },
}));

import { Realm } from '@prisma/client';
import { resolveAdminAccess, requireBodyAdmin, requireCityAdmin, requireMeetingAdmin, requireSuperadmin } from '../adminAccess';
import { mcpRealmStore, requestContext } from '../realm-context';
import { ForbiddenError, UnauthorizedError } from '../../api/errors';

const USER = { type: 'user', userId: 'u1' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

const asCityAdmin = (...cityIds: string[]) =>
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: cityIds.map(cityId => ({ cityId })) });
const asSuperadmin = () => mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });
// An admin of one body of a city, and of nothing else.
const asBodyAdmin = (bodyId: string, cityId: string) =>
    mockUserFindUnique.mockResolvedValue({
        isSuperAdmin: false,
        administers: [{ cityId: null, administrativeBodyId: bodyId, administrativeBody: { cityId } }],
    });
const BODIES: Record<string, { cityId: string }> = { council: { cityId: 'athens' }, committee: { cityId: 'athens' }, 'argos-council': { cityId: 'argos' } };
const MEETINGS: Record<string, { administrativeBodyId: string | null }> = {
    m1: { administrativeBodyId: 'council' }, m2: { administrativeBodyId: 'committee' }, m3: { administrativeBodyId: null },
};

beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    mockBodyFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(BODIES[where.id] ?? null));
    mockMeetingFindUnique.mockImplementation(({ where }: { where: { cityId_id: { id: string } } }) =>
        Promise.resolve(MEETINGS[where.cityId_id.id] ?? null));
});

describe('resolveAdminAccess', () => {
    it('gives nothing to an anonymous caller', async () => {
        await expect(resolveAdminAccess(null)).resolves.toBeNull();
    });

    it('treats a service key as a superadmin', async () => {
        await expect(resolveAdminAccess(SERVICE)).resolves.toEqual({ superadmin: true, cityIds: new Set(), bodyIds: new Set() });
    });

    it('gives nothing to a token whose owner administers nothing', async () => {
        await expect(resolveAdminAccess(USER)).resolves.toBeNull();
    });

    it('ignores party and person rights: they administer no city', async () => {
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: null }] });
        await expect(resolveAdminAccess(USER)).resolves.toBeNull();
    });

    it('reads the rights of the owner at call time', async () => {
        asCityAdmin('athens');
        await expect(resolveAdminAccess(USER)).resolves.toEqual({ superadmin: false, cityIds: new Set(['athens']), bodyIds: new Set() });

        asSuperadmin();
        await expect(resolveAdminAccess(USER)).resolves.toEqual({ superadmin: true, cityIds: new Set(), bodyIds: new Set() });
    });

    it('gives a body administrator access to their bodies and to no city', async () => {
        asBodyAdmin('council', 'athens');
        await expect(resolveAdminAccess(USER)).resolves.toEqual({ superadmin: false, cityIds: new Set(), bodyIds: new Set(['council']) });
    });
});

describe('requireCityAdmin', () => {
    it('refuses an anonymous caller as unauthenticated', async () => {
        await expect(requireCityAdmin(null, 'athens')).rejects.toThrow(UnauthorizedError);
    });

    it('refuses a token whose owner administers nothing', async () => {
        await expect(requireCityAdmin(USER, 'athens')).rejects.toThrow(/no administrator rights/);
    });

    it('lets an administrator reach their own city only', async () => {
        asCityAdmin('athens');
        await expect(requireCityAdmin(USER, 'athens')).resolves.toBeUndefined();
        await expect(requireCityAdmin(USER, 'argos')).rejects.toThrow(ForbiddenError);
    });

    it('lets a superadmin and a service key reach every city', async () => {
        asSuperadmin();
        await expect(requireCityAdmin(USER, 'argos')).resolves.toBeUndefined();
        await expect(requireCityAdmin(SERVICE, 'argos')).resolves.toBeUndefined();
    });

    it('refuses a body administrator, even for the city of their body', async () => {
        asBodyAdmin('council', 'athens');
        await expect(requireCityAdmin(USER, 'athens')).rejects.toThrow(ForbiddenError);
    });
});

describe('requireMeetingAdmin', () => {
    it('refuses an anonymous caller as unauthenticated', async () => {
        await expect(requireMeetingAdmin(null, 'athens', 'm1')).rejects.toThrow(UnauthorizedError);
    });

    it('lets a city administrator reach every meeting of the city without reading it', async () => {
        asCityAdmin('athens');
        await expect(requireMeetingAdmin(USER, 'athens', 'm1')).resolves.toBeUndefined();
        await expect(requireMeetingAdmin(USER, 'athens', 'm3')).resolves.toBeUndefined();
        expect(mockMeetingFindUnique).not.toHaveBeenCalled();
        await expect(requireMeetingAdmin(USER, 'argos', 'm1')).rejects.toThrow(ForbiddenError);
    });

    it('lets a body administrator reach the meetings of their body only', async () => {
        asBodyAdmin('council', 'athens');
        await expect(requireMeetingAdmin(USER, 'athens', 'm1')).resolves.toBeUndefined();
        await expect(requireMeetingAdmin(USER, 'athens', 'm2')).rejects.toThrow(ForbiddenError);
        await expect(requireMeetingAdmin(USER, 'athens', 'm3')).rejects.toThrow(ForbiddenError);
        await expect(requireMeetingAdmin(USER, 'athens', 'missing')).rejects.toThrow(ForbiddenError);
    });

    it('looks the meeting up in the city that the caller named', async () => {
        asBodyAdmin('council', 'athens');
        await requireMeetingAdmin(USER, 'athens', 'm1');
        expect(mockMeetingFindUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { cityId_id: { cityId: 'athens', id: 'm1' } },
        }));
    });

    it('lets a superadmin and a service key reach every meeting', async () => {
        asSuperadmin();
        await expect(requireMeetingAdmin(USER, 'argos', 'm3')).resolves.toBeUndefined();
        await expect(requireMeetingAdmin(SERVICE, 'argos', 'm3')).resolves.toBeUndefined();
    });
});

describe('requireBodyAdmin', () => {
    it('refuses an anonymous caller as unauthenticated', async () => {
        await expect(requireBodyAdmin(null, 'athens', 'council')).rejects.toThrow(UnauthorizedError);
    });

    it('lets a city administrator reach every body of the city', async () => {
        asCityAdmin('athens');
        await expect(requireBodyAdmin(USER, 'athens', 'council')).resolves.toBeUndefined();
        await expect(requireBodyAdmin(USER, 'athens', 'committee')).resolves.toBeUndefined();
        await expect(requireBodyAdmin(USER, 'argos', 'argos-council')).rejects.toThrow(ForbiddenError);
    });

    it('lets a body administrator reach their body only, in its own city', async () => {
        asBodyAdmin('council', 'athens');
        await expect(requireBodyAdmin(USER, 'athens', 'council')).resolves.toBeUndefined();
        await expect(requireBodyAdmin(USER, 'athens', 'committee')).rejects.toThrow(ForbiddenError);
        // The right body, named under the wrong city.
        await expect(requireBodyAdmin(USER, 'argos', 'council')).rejects.toThrow(ForbiddenError);
    });

    it('lets a superadmin and a service key reach every body', async () => {
        asSuperadmin();
        await expect(requireBodyAdmin(USER, 'argos', 'argos-council')).resolves.toBeUndefined();
        await expect(requireBodyAdmin(SERVICE, 'argos', 'argos-council')).resolves.toBeUndefined();
    });
});

describe('requireSuperadmin', () => {
    it('refuses a city administrator and a body administrator', async () => {
        asCityAdmin('athens');
        await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
        asBodyAdmin('council', 'athens');
        await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
    });

    it('passes a superadmin token and a service key', async () => {
        asSuperadmin();
        await expect(requireSuperadmin(USER)).resolves.toBeUndefined();
        await expect(requireSuperadmin(SERVICE)).resolves.toBeUndefined();
    });
});

describe('inside a request scope', () => {
    it('reads the access the route resolved instead of querying again', async () => {
        const access = { superadmin: false, cityIds: new Set(['athens']), bodyIds: new Set<string>() };
        await mcpRealmStore.run(requestContext(Realm.greece, null, USER, { adminAccess: access }), async () => {
            await expect(requireCityAdmin(USER, 'athens')).resolves.toBeUndefined();
            await expect(requireCityAdmin(USER, 'argos')).rejects.toThrow(ForbiddenError);
            await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
        });
        expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('reads the bodies the route resolved for the meeting and body guards', async () => {
        const access = { superadmin: false, cityIds: new Set<string>(), bodyIds: new Set(['council']) };
        await mcpRealmStore.run(requestContext(Realm.greece, null, USER, { adminAccess: access }), async () => {
            await expect(requireMeetingAdmin(USER, 'athens', 'm1')).resolves.toBeUndefined();
            await expect(requireMeetingAdmin(USER, 'athens', 'm2')).rejects.toThrow(ForbiddenError);
            await expect(requireBodyAdmin(USER, 'athens', 'council')).resolves.toBeUndefined();
            await expect(requireBodyAdmin(USER, 'athens', 'committee')).rejects.toThrow(ForbiddenError);
        });
        expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('refuses when the route resolved no access, whatever the database says now', async () => {
        asSuperadmin();
        await mcpRealmStore.run(requestContext(Realm.greece, null, USER, { adminAccess: null }), async () => {
            await expect(requireSuperadmin(USER)).rejects.toThrow(/no administrator rights/);
        });
    });
});
