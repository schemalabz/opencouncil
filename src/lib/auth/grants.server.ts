import 'server-only';
import { cache } from 'react';
import { Prisma, type AdministrativeBody, type City, type CouncilMeeting, type Party, type Person, type Realm } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { getCityRealm } from '@/lib/db/cityRealm';
import { PENDING_GRANT_MS, resolve, roleHasRight, type Actor, type Right, type Target } from './rights';

/**
 * The grants of a user without a session (#875): the MCP server and the
 * highlight core take an explicit identity. src/lib/auth.ts reads the same
 * rows for the session. Both resolve with src/lib/auth/rights.ts.
 */

/** The rows that count as rights: accepted and not revoked (see grantStatus). */
export const activeGrantWhere = { acceptedAt: { not: null }, revokedAt: null } satisfies Prisma.AdministersWhereInput;

/**
 * Whether a P2002 comes from the `Administers_active_*` indexes: the account
 * already holds the role on the scope. Prisma names the columns of the index,
 * and these always include `userId` and `role`.
 */
export function isDuplicateGrant(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) return false;
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes('userId') && target.includes('role');
}

export const DUPLICATE_GRANT_MESSAGE = 'An account cannot hold the same role on the same scope two times.';

/** What the resolver needs of a grant row. */
export const grantSelect = {
    role: true,
    realm: true,
    cityId: true,
    partyId: true,
    personId: true,
    administrativeBodyId: true,
    administrativeBody: { select: { cityId: true } },
} satisfies Prisma.AdministersSelect;

export type LoadedActor = Actor & { userId: string };

/** Whether the user holds an active `admin` grant on a realm: the gate of the /admin tree. */
export async function isRealmAdmin(userId: string): Promise<boolean> {
    const grant = await prisma.administers.findFirst({
        where: { userId, role: 'admin', realm: { not: null }, ...activeGrantWhere },
        select: { id: true },
    });
    return grant !== null;
}

/** The user as an actor, or null for an id that no user has. */
export async function loadActor(userId: string): Promise<LoadedActor | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true, administers: { where: activeGrantWhere, select: grantSelect } },
    });
    if (!user) return null;
    return { userId, isSuperAdmin: user.isSuperAdmin, grants: user.administers };
}

/**
 * What a check is about. The shapes that the check accepts:
 *
 * - `{}`: superadmin only.
 * - `{ realm }`: a grant on the realm.
 * - `{ cityId }`: a grant on the city. A body grant never passes this one,
 *   so a mutation that nobody converts to a narrower shape stays closed to it.
 * - `{ cityId, councilMeetingId }`: a grant on the city, or on the body that
 *   holds the meeting.
 * - `{ cityId, administrativeBodyId }`: a grant on the city, or on that body.
 * - `{ partyId }`: a grant on the party, or on its city.
 * - `{ personId }`: a grant on the person, on its city, or on the bodies it
 *   sits on (see personIsOwnedByBodyAdmin).
 *
 * A grant on the realm of the city passes every shape below the realm.
 */
export type AuthorizationScope = {
    realm?: Realm;
    cityId?: City['id'];
    partyId?: Party['id'];
    personId?: Person['id'];
    councilMeetingId?: CouncilMeeting['id'];
    administrativeBodyId?: AdministrativeBody['id'];
};

/** Throws on a shape the list above does not name: that is a bug of the caller. */
export function validateScope({ realm, cityId, partyId, personId, councilMeetingId, administrativeBodyId }: AuthorizationScope): void {
    const definedParams = [partyId, personId].filter(Boolean);
    const hasCityId = Boolean(cityId);
    const hasCouncilMeetingId = Boolean(councilMeetingId);
    const hasBodyId = Boolean(administrativeBodyId);

    if (realm && (hasCityId || hasCouncilMeetingId || hasBodyId || definedParams.length > 0)) {
        throw new Error('realm cannot be combined with another scope');
    }
    if (definedParams.length > 1) {
        throw new Error('Only one of partyId or personId should be defined');
    }
    if (definedParams.length > 0 && (hasCityId || hasCouncilMeetingId || hasBodyId)) {
        throw new Error('cityId/councilMeetingId/administrativeBodyId cannot be combined with partyId or personId');
    }
    if ((hasCouncilMeetingId || hasBodyId) && !hasCityId) {
        throw new Error('cityId is required when councilMeetingId or administrativeBodyId is provided');
    }
    if (hasCouncilMeetingId && hasBodyId) {
        throw new Error('Only one of councilMeetingId or administrativeBodyId should be defined');
    }
}

// Request-scoped: a meeting page asks about the same meeting many times.
const meetingBody = cache(async (cityId: string, meetingId: string) =>
    prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { administrativeBodyId: true },
    }));

const bodyCity = cache(async (bodyId: string) =>
    prisma.administrativeBody.findUnique({
        where: { id: bodyId },
        select: { cityId: true },
    }));

const partyCity = cache(async (partyId: string) =>
    prisma.party.findUnique({
        where: { id: partyId },
        select: { cityId: true },
    }));

const personRoles = cache(async (personId: string) =>
    prisma.person.findUnique({
        where: { id: personId },
        select: { cityId: true, roles: { select: { administrativeBodyId: true } } },
    }));

const cityRealm = cache(getCityRealm);

/**
 * The realm of a city, for an actor that holds a realm grant; undefined for
 * every other actor, whose check needs no realm and so no query.
 */
export async function realmFor(actor: Actor, cityId: string): Promise<Realm | undefined> {
    if (!actor.grants.some((grant) => grant.realm !== null)) return undefined;
    return (await cityRealm(cityId)) ?? undefined;
}

/**
 * The scope as a target, with the rows the resolver needs: the body of a
 * meeting, the city of a party or a person, the roles of a person. Null when
 * the entity does not exist, or when the body is not a body of the named
 * city: the routes take the city and the body from two URL segments, and
 * such a check fails.
 */
export async function toTarget(scope: AuthorizationScope, actor: Actor): Promise<Target | null> {
    const { realm, cityId, partyId, personId, councilMeetingId, administrativeBodyId } = scope;
    if (realm) return { level: 'realm', realm };

    if (cityId) {
        const cityRealm = await realmFor(actor, cityId);
        if (administrativeBodyId) {
            const body = await bodyCity(administrativeBodyId);
            if (body?.cityId !== cityId) return null;
            return { level: 'body', realm: cityRealm, cityId, bodyId: administrativeBodyId };
        }
        if (councilMeetingId) {
            // null, not a throw: the meeting layout asks this on every render,
            // and an unknown meeting must 404 there, not 500.
            const meeting = await meetingBody(cityId, councilMeetingId);
            if (!meeting) return null;
            // A meeting with no body is the city's.
            if (!meeting.administrativeBodyId) return { level: 'city', realm: cityRealm, cityId };
            return { level: 'body', realm: cityRealm, cityId, bodyId: meeting.administrativeBodyId };
        }
        return { level: 'city', realm: cityRealm, cityId };
    }

    if (partyId) {
        const party = await partyCity(partyId);
        if (!party) return null;
        return { level: 'party', realm: await realmFor(actor, party.cityId), cityId: party.cityId, partyId };
    }

    if (personId) {
        const person = await personRoles(personId);
        if (!person) return null;
        return {
            level: 'person',
            realm: await realmFor(actor, person.cityId),
            cityId: person.cityId,
            personId,
            roleBodyIds: person.roles.map((role) => role.administrativeBodyId),
        };
    }

    return { level: 'global' };
}

/**
 * Whether a grant that carries the right sits on the city, on a body of it,
 * or on a realm. When none does, no target inside the city passes, and the
 * check needs no row: a reader with a party grant costs no query per meeting.
 */
function mayReachCity(actor: Actor, right: Right, cityId: string): boolean {
    return actor.grants.some((grant) => roleHasRight(grant.role, right)
        && (grant.realm !== null || grant.cityId === cityId || grant.administrativeBody?.cityId === cityId));
}

/**
 * Whether the actor holds the right on the scope. A grant on the city or
 * above passes every meeting of the city, so that case skips the read of
 * the meeting: the meeting layout and the MCP guards ask it on every call.
 */
export async function hasRightOn(actor: Actor, right: Right, scope: AuthorizationScope): Promise<boolean> {
    if (actor.isSuperAdmin) return true;
    if (scope.cityId && !mayReachCity(actor, right, scope.cityId)) return false;
    if (scope.cityId && scope.councilMeetingId
        && resolve(actor, right, { level: 'city', realm: await realmFor(actor, scope.cityId), cityId: scope.cityId })) {
        return true;
    }
    const target = await toTarget(scope, actor);
    return target !== null && resolve(actor, right, target);
}

// --- The invite lifecycle (#875, PR 3) -------------------------------------

/** The database a lifecycle write runs on: the client, or the transaction of a caller. */
type Db = Pick<Prisma.TransactionClient, 'user' | 'administers'>;

/** The oldest creation a pending row may have and still count: before that, it expired. */
export const pendingSince = (now = new Date()): Date => new Date(now.getTime() - PENDING_GRANT_MS);

/**
 * The rows that count against the cap of a scope: the accepted ones, and
 * the invites still open. An admin cannot fan invites out past the cap by
 * leaving them pending; an expired invite frees its place.
 */
export const countedGrantWhere = (now = new Date()): Prisma.AdministersWhereInput => ({
    revokedAt: null,
    OR: [{ acceptedAt: { not: null } }, { createdAt: { gte: pendingSince(now) } }],
});

/**
 * Whether a new grant to the account takes effect at once: the account has
 * signed in at least once (a magic link sets `emailVerified`, Google leaves
 * an `Account`, the dev quick-login a `Session`), or it is a machine
 * account, which never signs in and gets its rights from a superadmin. A
 * grant to any other account waits as a pending invite until the first
 * sign-in.
 */
export async function acceptsGrantsAtOnce(db: Db, userId: string): Promise<boolean> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { isMachine: true, emailVerified: true, _count: { select: { accounts: true, sessions: true } } },
    });
    if (!user) return false;
    return user.isMachine || user.emailVerified !== null || user._count.accounts > 0 || user._count.sessions > 0;
}

/** The `acceptedAt` of a new grant: now for an account that takes it at once, else a pending invite. */
export async function acceptedAtFor(db: Db, userId: string, now = new Date()): Promise<Date | null> {
    return (await acceptsGrantsAtOnce(db, userId)) ? now : null;
}

/**
 * Open the pending invites of the account again, for another
 * PENDING_GRANT_DAYS: a resend. The row stays the same row, so the history
 * shows no withdrawal that nobody made; `createdAt` is when the invite was
 * last sent. The rows of `where` narrow it, as one role on one scope.
 */
export async function renewPendingGrants(
    db: Db,
    userId: string,
    renewedBy: string | null,
    where: Prisma.AdministersWhereInput = {},
    now = new Date(),
): Promise<number> {
    const { count } = await db.administers.updateMany({
        where: { ...where, userId, acceptedAt: null, revokedAt: null },
        data: { createdAt: now, ...(renewedBy ? { grantedById: renewedBy } : {}) },
    });
    return count;
}

/**
 * The first sign-in takes the pending invites of the account up: every
 * pending row younger than PENDING_GRANT_DAYS is accepted at once. An older
 * one stays pending, and the Team page shows it as expired with a resend.
 * Called from the signIn event of Auth.js and from the dev quick-login.
 */
export async function acceptPendingGrants(db: Db, userId: string, now = new Date()): Promise<number> {
    const { count } = await db.administers.updateMany({
        where: { userId, acceptedAt: null, revokedAt: null, createdAt: { gte: pendingSince(now) } },
        data: { acceptedAt: now },
    });
    return count;
}
