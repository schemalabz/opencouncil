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
import { resolveAdminAccess, requireAdminRealms, requireBodyRight, requireCityRight, requireMeetingRight, requireRealmRight, requireSuperadmin } from '../adminAccess';
import { mcpRealmStore, requestContext } from '../realm-context';
import { ForbiddenError, UnauthorizedError } from '../../api/errors';
import type { ActiveGrant } from '@/lib/auth/rights';
import { actorWith, bodyGrant, cityGrant, grant, realmGrant } from '@/lib/auth/__tests__/fixtures';

const USER = { userId: 'u1' } as const;

const holding = (...grants: ActiveGrant[]) => mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: grants });
const asCityAdmin = (...cityIds: string[]) => holding(...cityIds.map(cityId => cityGrant(cityId)));
const asSuperadmin = () => mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });
// An admin of one body of a city, and of nothing else.
const asBodyAdmin = (bodyId: string, cityId: string) => holding(bodyGrant(bodyId, cityId));

// The admin guards of the suite, each with the right its tool asks for.
const requireCityAdmin = (identity: typeof USER | null, cityId: string) => requireCityRight(identity, 'meeting.manage', cityId);
const requireMeetingAdmin = (identity: typeof USER | null, cityId: string, meetingId: string) =>
    requireMeetingRight(identity, 'meeting.manage', cityId, meetingId);
const requireBodyAdmin = (identity: typeof USER | null, cityId: string, bodyId: string) =>
    requireBodyRight(identity, 'meeting.manage', cityId, bodyId);
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

    it('gives nothing to a token whose owner administers nothing', async () => {
        await expect(resolveAdminAccess(USER)).resolves.toBeNull();
    });

    it('ignores party and person rights: they administer no council', async () => {
        holding(grant({ partyId: 'p1' }), grant({ personId: 'n1' }));
        await expect(resolveAdminAccess(USER)).resolves.toBeNull();
    });

    it('ignores a grant whose role manages no meeting and runs no task', async () => {
        holding(cityGrant('athens', 'viewer'), cityGrant('athens', 'records'), cityGrant('athens', 'highlights'));
        await expect(resolveAdminAccess(USER)).resolves.toBeNull();
    });

    it('reads the rights of the owner at call time', async () => {
        asCityAdmin('athens');
        await expect(resolveAdminAccess(USER)).resolves.toEqual(actorWith([cityGrant('athens')]));

        holding(cityGrant('athens', 'meetings'));
        await expect(resolveAdminAccess(USER)).resolves.toEqual(actorWith([cityGrant('athens', 'meetings')]));

        holding(realmGrant('greece'));
        await expect(resolveAdminAccess(USER)).resolves.toEqual(actorWith([realmGrant('greece')]));

        asSuperadmin();
        await expect(resolveAdminAccess(USER)).resolves.toEqual({ userId: 'u1', isSuperAdmin: true, grants: [] });
    });

    it('gives a body administrator access, with their body and no city', async () => {
        asBodyAdmin('council', 'athens');
        await expect(resolveAdminAccess(USER)).resolves.toEqual(actorWith([bodyGrant('council', 'athens')]));
    });
});

describe('the right of the guard', () => {
    it('passes a role that carries it and refuses one that does not', async () => {
        holding(cityGrant('athens', 'meetings'));
        await expect(requireCityRight(USER, 'meeting.manage', 'athens')).resolves.toBeUndefined();
        await expect(requireCityRight(USER, 'tasks.run', 'athens')).resolves.toBeUndefined();
        await expect(requireCityRight(USER, 'admin', 'athens')).rejects.toThrow(ForbiddenError);
        await expect(requireMeetingRight(USER, 'highlight.manage', 'athens', 'm1')).rejects.toThrow(ForbiddenError);
        await expect(requireBodyRight(USER, 'records.edit', 'athens', 'council')).rejects.toThrow(ForbiddenError);
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

    it('lets a superadmin reach every city', async () => {
        asSuperadmin();
        await expect(requireCityAdmin(USER, 'argos')).resolves.toBeUndefined();
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

    it('lets a superadmin reach every meeting', async () => {
        asSuperadmin();
        await expect(requireMeetingAdmin(USER, 'argos', 'm3')).resolves.toBeUndefined();
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

    it('lets a superadmin reach every body', async () => {
        asSuperadmin();
        await expect(requireBodyAdmin(USER, 'argos', 'argos-council')).resolves.toBeUndefined();
    });
});

describe('requireRealmRight', () => {
    it('passes the admin of that realm, and refuses the admin of another realm or of a city in it', async () => {
        holding(realmGrant(Realm.poland));
        await expect(requireRealmRight(USER, 'admin', Realm.poland)).resolves.toBeUndefined();
        await expect(requireRealmRight(USER, 'admin', Realm.greece)).rejects.toThrow(ForbiddenError);
        asCityAdmin('athens');
        await expect(requireRealmRight(USER, 'admin', Realm.greece)).rejects.toThrow(ForbiddenError);
    });

    it('passes a superadmin on every realm', async () => {
        asSuperadmin();
        await expect(requireRealmRight(USER, 'admin', Realm.poland)).resolves.toBeUndefined();
    });
});

describe('requireAdminRealms', () => {
    it('answers null for a superadmin, the realms of a realm admin, and refuses a city admin', async () => {
        asSuperadmin();
        await expect(requireAdminRealms(USER)).resolves.toBeNull();
        holding(realmGrant(Realm.poland), realmGrant(Realm.france), cityGrant('athens'));
        await expect(requireAdminRealms(USER)).resolves.toEqual([Realm.poland, Realm.france]);
        asCityAdmin('athens');
        await expect(requireAdminRealms(USER)).rejects.toThrow(ForbiddenError);
    });
});

describe('requireSuperadmin', () => {
    it('refuses a city administrator and a body administrator', async () => {
        asCityAdmin('athens');
        await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
        asBodyAdmin('council', 'athens');
        await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
    });

    it('passes a superadmin token', async () => {
        asSuperadmin();
        await expect(requireSuperadmin(USER)).resolves.toBeUndefined();
    });
});

describe('inside a request scope', () => {
    it('reads the access the route resolved instead of querying again', async () => {
        const access = actorWith([cityGrant('athens')]);
        await mcpRealmStore.run(requestContext(Realm.greece, null, USER, { adminAccess: access }), async () => {
            await expect(requireCityAdmin(USER, 'athens')).resolves.toBeUndefined();
            await expect(requireCityAdmin(USER, 'argos')).rejects.toThrow(ForbiddenError);
            await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
        });
        expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('reads the bodies the route resolved for the meeting and body guards', async () => {
        const access = actorWith([bodyGrant('council', 'athens')]);
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
