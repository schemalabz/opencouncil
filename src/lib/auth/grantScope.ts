import type { Realm } from '@prisma/client';
import type { AdminEntityType } from '@/lib/db/adminEntities';
import type { InviteGrantRequest } from '@/lib/zod-schemas/user';
import { getRealmDomain } from '@/lib/realm';

/**
 * The scope of a grant row as a person reads it (#875): its kind, its name
 * and the page it stands for. Pure, so the Team page, the profile and the
 * invite email name a scope the same way.
 */

export type GrantScopeRow = {
    realm: Realm | null;
    city: { id: string; name: string } | null;
    administrativeBody: { id: string; name: string; cityId: string; city?: { name: string } } | null;
    party: { id: string; name: string; cityId: string; city?: { name: string } } | null;
    person: { id: string; name: string; cityId: string; city?: { name: string } } | null;
};

export type NamedScope = {
    kind: AdminEntityType;
    /** The scope's own name: the body, the party, the person, the city, or the realm's domain. */
    name: string;
    /** The city the scope sits in; null for a city or a realm, or when the row does not carry it. */
    cityName: string | null;
    /** The page of the scope, relative to the site root. */
    path: string;
};

export function namedScope(row: GrantScopeRow): NamedScope {
    if (row.realm) return { kind: 'realm', name: getRealmDomain(row.realm), cityName: null, path: '/admin' };
    if (row.city) return { kind: 'city', name: row.city.name, cityName: null, path: `/${row.city.id}` };
    if (row.administrativeBody) {
        const body = row.administrativeBody;
        return { kind: 'body', name: body.name, cityName: body.city?.name ?? null, path: `/${body.cityId}/meetings` };
    }
    if (row.party) return { kind: 'party', name: row.party.name, cityName: row.party.city?.name ?? null, path: `/${row.party.cityId}/parties/${row.party.id}` };
    if (row.person) return { kind: 'person', name: row.person.name, cityName: row.person.city?.name ?? null, path: `/${row.person.cityId}/people/${row.person.id}` };
    throw new Error('A grant row names no scope');
}

/** "Youth Council, Chania" for a scope inside a city; the name alone otherwise. */
export const scopeLabel = (scope: NamedScope): string => scope.cityName ? `${scope.name}, ${scope.cityName}` : scope.name;

/** The scope of a row as the invite request names it: what a resend posts. */
export function scopeOfGrant(row: GrantScopeRow): InviteGrantRequest['scope'] {
    if (row.realm) return { realm: row.realm };
    if (row.city) return { cityId: row.city.id };
    if (row.administrativeBody) return { administrativeBodyId: row.administrativeBody.id };
    if (row.party) return { partyId: row.party.id };
    if (row.person) return { personId: row.person.id };
    throw new Error('A grant row names no scope');
}

/** The realm a row belongs to: its own, or the realm of the city of its scope. */
export function realmOfGrant(row: {
    realm: Realm | null;
    city: { realm: Realm } | null;
    administrativeBody: { city: { realm: Realm } } | null;
    party: { city: { realm: Realm } } | null;
    person: { city: { realm: Realm } } | null;
}): Realm | null {
    return row.realm ?? row.city?.realm ?? row.administrativeBody?.city.realm ?? row.party?.city.realm ?? row.person?.city.realm ?? null;
}

type InviteRealmRow = Parameters<typeof realmOfGrant>[0] & { createdAt: Date; acceptedAt: Date | null };

/**
 * The realm whose domain and language an invite to the account takes: the
 * realm of its oldest pending row, else of its oldest row. The session cookie
 * is host-only, so the link lands where the account is to work first.
 */
export function inviteRealm(rows: InviteRealmRow[]): Realm | null {
    const ordered = [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const first = ordered.find((row) => row.acceptedAt === null) ?? ordered[0];
    return first ? realmOfGrant(first) : null;
}
