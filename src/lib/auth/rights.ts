import type { GrantRole, Realm } from '@prisma/client';
import type { UnreleasedScope } from '@/lib/unreleased';

/**
 * The rights model (#875), with no session and no database: what a role
 * carries, and whether an actor holds a right on a target. src/lib/auth.ts
 * answers for the session; src/lib/auth/grants.server.ts loads an actor
 * without one and turns an AuthorizationScope into a Target.
 */

export const RIGHTS = [
    'drafts.read',
    'records.read',
    'records.edit',
    'minutes.export',
    'transcript.export',
    'meeting.manage',
    'meeting.release',
    'tasks.run',
    'highlight.manage',
    'notification.send',
    'admin',
] as const;

export type Right = (typeof RIGHTS)[number];

export const GRANT_ROLES = ['admin', 'records', 'meetings', 'highlights', 'viewer'] as const satisfies readonly GrantRole[];

const rights = (...list: Right[]): ReadonlySet<Right> => new Set(list);

/** The rights of each role. `admin` carries every right, `admin` itself included. */
export const ROLE_RIGHTS: Record<GrantRole, ReadonlySet<Right>> = {
    admin: new Set(RIGHTS),
    records: rights('drafts.read', 'records.read', 'records.edit', 'minutes.export', 'transcript.export'),
    meetings: rights('drafts.read', 'meeting.manage', 'meeting.release', 'tasks.run'),
    highlights: rights('drafts.read', 'highlight.manage', 'notification.send'),
    viewer: rights('drafts.read', 'records.read', 'transcript.export'),
};

export function roleHasRight(role: GrantRole, right: Right): boolean {
    return ROLE_RIGHTS[role].has(right);
}

/** The rights the admin page of a meeting has a section for: a holder of any of them opens it. */
export const ADMIN_PAGE_RIGHTS = ['admin', 'meeting.manage', 'tasks.run', 'meeting.release', 'notification.send', 'transcript.export'] as const satisfies readonly Right[];

/**
 * One active grant: a role at exactly one scope. The body of a body grant
 * rides along with its city, so a body named under the wrong city never
 * passes. A grant whose entity is gone has no row: every scope cascades.
 */
export type ActiveGrant = {
    role: GrantRole;
    realm: Realm | null;
    cityId: string | null;
    partyId: string | null;
    personId: string | null;
    administrativeBodyId: string | null;
    administrativeBody: { cityId: string } | null;
};

export type Actor = {
    isSuperAdmin: boolean;
    grants: readonly ActiveGrant[];
};

/** A user row with its active grants, as an actor. */
export const actorOf = (user: { isSuperAdmin: boolean; administers: readonly ActiveGrant[] }): Actor =>
    ({ isSuperAdmin: user.isSuperAdmin, grants: user.administers });

/**
 * What a check is about, with the ancestors a grant may sit on. A body, a
 * party and a person hang off their city; the city hangs off its realm,
 * when the caller knows it. `realm` is optional below the realm level: a
 * caller looks it up only for an actor that holds a realm grant.
 */
export type Target =
    | { level: 'global' }
    | { level: 'realm'; realm: Realm }
    | { level: 'city'; realm?: Realm; cityId: string }
    | { level: 'body'; realm?: Realm; cityId: string; bodyId: string }
    | { level: 'party'; realm?: Realm; cityId: string; partyId: string }
    | {
        level: 'person';
        realm?: Realm;
        cityId: string;
        personId: string;
        /** The body of each role of the person, null for a role on no body. */
        roleBodyIds: (string | null)[];
    };

const holding = (actor: Actor, right: Right): ActiveGrant[] =>
    actor.grants.filter((grant) => roleHasRight(grant.role, right));

/** The bodies of one city that the grants hold directly. */
function heldBodyIds(grants: readonly ActiveGrant[], cityId: string): Set<string> {
    return new Set(grants.flatMap((grant) =>
        grant.administrativeBodyId && grant.administrativeBody?.cityId === cityId ? [grant.administrativeBodyId] : []));
}

/**
 * A body admin owns a person when the person has at least one role and every
 * role, past or present, is on a body they hold. A person with no role goes
 * on every council roster, and a person with a seat elsewhere (a party, the
 * council, a city-level office) is a superadmin's or city admin's to edit.
 */
export function personIsOwnedByBodyAdmin(
    roles: { administrativeBodyId?: string | null }[],
    heldBodyIds: ReadonlySet<string>,
): boolean {
    return roles.length > 0 && roles.every((role) => !!role.administrativeBodyId && heldBodyIds.has(role.administrativeBodyId));
}

/**
 * Whether the actor holds the right on the target: a superadmin holds every
 * right everywhere; nobody else holds one on the global target; otherwise a
 * grant whose role carries the right, at the target or at an ancestor of it.
 */
export function resolve(actor: Actor, right: Right, target: Target): boolean {
    if (actor.isSuperAdmin) return true;
    if (target.level === 'global') return false;

    const grants = holding(actor, right);
    if (target.realm && grants.some((grant) => grant.realm === target.realm)) return true;
    if (target.level === 'realm') return false;

    if (grants.some((grant) => grant.cityId === target.cityId)) return true;
    switch (target.level) {
        case 'city':
            return false;
        case 'body':
            return grants.some((grant) => grant.administrativeBodyId === target.bodyId && grant.administrativeBody?.cityId === target.cityId);
        case 'party':
            return grants.some((grant) => grant.partyId === target.partyId);
        case 'person': {
            if (grants.some((grant) => grant.personId === target.personId)) return true;
            const held = heldBodyIds(grants, target.cityId);
            return held.size > 0 && personIsOwnedByBodyAdmin(target.roleBodyIds.map((administrativeBodyId) => ({ administrativeBodyId })), held);
        }
    }
}

/** The realms on which the actor holds the `admin` right, each once. */
export function adminRealms(actor: Actor): Realm[] {
    return [...new Set(holding(actor, 'admin').flatMap((grant) => grant.realm ? [grant.realm] : []))];
}

/**
 * Whether the actor may give a grant at the target: a superadmin may give
 * any; a realm grant, the global scope and a person are a superadmin's to
 * give; any other needs the `admin` right at the target or above it. A row
 * on a person speaks for the person (setVoicePrintConsent), so only a claim
 * or a superadmin writes one.
 */
export function canGrant(actor: Actor, target: Target): boolean {
    if (actor.isSuperAdmin) return true;
    if (target.level === 'global' || target.level === 'realm' || target.level === 'person') return false;
    return resolve(actor, 'admin', target);
}

/**
 * How far the right reaches without a target: `all` for a superadmin, else
 * the realms, the cities and the bodies (each with its city) whose grant
 * carries the right. For a filter over many rows, where a target per row
 * would cost a query each.
 */
export type Reach = {
    all: boolean;
    realms: Set<Realm>;
    cityIds: Set<string>;
    bodies: Map<string, string>;
};

export const emptyReach = (): Reach => ({ all: false, realms: new Set(), cityIds: new Set(), bodies: new Map() });

export function reachOf(actor: Actor, right: Right): Reach {
    const reach = emptyReach();
    if (actor.isSuperAdmin) return { ...reach, all: true };
    for (const grant of holding(actor, right)) {
        if (grant.realm) reach.realms.add(grant.realm);
        if (grant.cityId) reach.cityIds.add(grant.cityId);
        if (grant.administrativeBodyId && grant.administrativeBody) reach.bodies.set(grant.administrativeBodyId, grant.administrativeBody.cityId);
    }
    return reach;
}

/**
 * How far the right reaches inside one city: every meeting and body of the
 * city, or the bodies held directly, sorted. The shape of UnreleasedScope,
 * because that is its first use (see src/lib/unreleased.ts).
 */
export function scopeInCity(actor: Actor, right: Right, cityId: string, realm?: Realm): UnreleasedScope {
    if (resolve(actor, right, { level: 'city', cityId, realm })) return { all: true };
    return { all: false, bodyIds: [...heldBodyIds(holding(actor, right), cityId)].sort() };
}

// --- The lifecycle of a grant row ------------------------------------------

/** A pending grant (an invite nobody accepted) expires this many days after its creation. */
export const PENDING_GRANT_DAYS = 14;

export type GrantStatus = 'active' | 'pending' | 'expired' | 'revoked';

export function grantStatus(
    row: { createdAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
    now: Date = new Date(),
): GrantStatus {
    if (row.revokedAt) return 'revoked';
    if (row.acceptedAt) return 'active';
    const ageMs = now.getTime() - row.createdAt.getTime();
    return ageMs > PENDING_GRANT_DAYS * 24 * 60 * 60 * 1000 ? 'expired' : 'pending';
}

/** The rows that count as rights now: accepted and not revoked. */
export function activeGrants<T extends { createdAt: Date; acceptedAt: Date | null; revokedAt: Date | null }>(rows: T[], now?: Date): T[] {
    return rows.filter((row) => grantStatus(row, now) === 'active');
}
