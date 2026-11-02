import type { Realm } from '@prisma/client';
import type { ActiveGrant } from '@/lib/auth/rights';
import type { LoadedActor } from '@/lib/auth/grants.server';

/**
 * Grant rows and actors for unit tests. Every row names its role: the
 * resolver has no default, and a fixture must not hide which role it tests.
 */

/** One grant row as the resolver reads it; `role` is admin unless the row says otherwise. */
export const grant = (row: Partial<ActiveGrant>): ActiveGrant => ({
    role: 'admin',
    realm: null,
    cityId: null,
    partyId: null,
    personId: null,
    administrativeBodyId: null,
    administrativeBody: null,
    ...row,
});

export const cityGrant = (cityId: string, role: ActiveGrant['role'] = 'admin') => grant({ role, cityId });
export const realmGrant = (realm: Realm, role: ActiveGrant['role'] = 'admin') => grant({ role, realm });
/** A grant on one body of a city, and on nothing else. */
export const bodyGrant = (bodyId: string, cityId: string, role: ActiveGrant['role'] = 'admin') =>
    grant({ role, administrativeBodyId: bodyId, administrativeBody: { cityId } });

export const actorWith = (grants: ActiveGrant[], userId = 'u1'): LoadedActor => ({ userId, isSuperAdmin: false, grants });
export const superadmin = (userId = 'root'): LoadedActor => ({ userId, isSuperAdmin: true, grants: [] });
