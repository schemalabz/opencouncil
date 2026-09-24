/** @jest-environment node */

const mockUserFindUnique = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    },
}));

import { Realm } from '@prisma/client';
import { resolveAdminAccess, requireCityAdmin, requireSuperadmin } from '../adminAccess';
import { mcpRealmStore, requestContext } from '../realm-context';
import { ForbiddenError, UnauthorizedError } from '../../api/errors';

const USER = { type: 'user', userId: 'u1' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

const asCityAdmin = (...cityIds: string[]) =>
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: cityIds.map(cityId => ({ cityId })) });
const asSuperadmin = () => mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });

beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
});

describe('resolveAdminAccess', () => {
    it('gives nothing to an anonymous caller', async () => {
        await expect(resolveAdminAccess(null)).resolves.toBeNull();
    });

    it('treats a service key as a superadmin', async () => {
        await expect(resolveAdminAccess(SERVICE)).resolves.toEqual({ superadmin: true, cityIds: new Set() });
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
        await expect(resolveAdminAccess(USER)).resolves.toEqual({ superadmin: false, cityIds: new Set(['athens']) });

        asSuperadmin();
        await expect(resolveAdminAccess(USER)).resolves.toEqual({ superadmin: true, cityIds: new Set() });
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
});

describe('requireSuperadmin', () => {
    it('refuses a city administrator', async () => {
        asCityAdmin('athens');
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
        const access = { superadmin: false, cityIds: new Set(['athens']) };
        await mcpRealmStore.run(requestContext(Realm.greece, null, USER, { adminAccess: access }), async () => {
            await expect(requireCityAdmin(USER, 'athens')).resolves.toBeUndefined();
            await expect(requireCityAdmin(USER, 'argos')).rejects.toThrow(ForbiddenError);
            await expect(requireSuperadmin(USER)).rejects.toThrow(ForbiddenError);
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
