import "server-only";
import { Prisma, type GrantRole, type Realm } from "@prisma/client";
import prisma from "./prisma";
import { getCurrentUser } from "@/lib/auth";
import { BadRequestError, ForbiddenError, NotFoundError, notAuthorizedError } from "@/lib/api/errors";
import { sendInviteEmail } from "@/lib/auth/invite";
import { isMachineAccountAddress } from "@/lib/auth/machineAccounts";
import { activeGrantWhere } from "@/lib/auth/grants.server";
import { actorOf, adminRealms, canGrant, grantStatus, resolve, type Actor, type GrantStatus, type Target } from "@/lib/auth/rights";
import { normalizeEmail } from "@/lib/personJoin/email";
import { ALL_REALMS } from "@/lib/realm";
import { peopleOnly } from "@/lib/db/types";
import { lockKey } from "@/lib/db/advisoryLock";
import type { GrantErrorCode } from "@/lib/zod-schemas/user";

/**
 * The grants of a realm, a city and what hangs off it (#875): who holds a
 * role where, who may give one, and who may take one back. The rules of the
 * body admins (#828) hold at every scope: a cap per scope, no machine
 * address, and the last admin of a scope goes only by the hand of an admin
 * above it. A revoke keeps the row (grantStatus reads it as revoked).
 *
 * Every function checks the viewer itself. The route gates the /admin tree
 * only; src/lib/auth/rights.ts answers who may give a grant at a target.
 */

export type GrantScope =
    | { realm: Realm }
    | { cityId: string }
    | { administrativeBodyId: string }
    | { partyId: string }
    | { personId: string };

export const grantRowSelect = {
    id: true,
    role: true,
    realm: true,
    cityId: true,
    partyId: true,
    personId: true,
    administrativeBodyId: true,
    claimedAt: true,
    acceptedAt: true,
    revokedAt: true,
    createdAt: true,
    user: { select: { id: true, email: true, name: true, isMachine: true } },
    grantedBy: { select: { id: true, name: true, email: true } },
    revokedBy: { select: { id: true, name: true } },
    city: { select: { id: true, name: true } },
    administrativeBody: { select: { id: true, name: true, cityId: true } },
    party: { select: { id: true, name: true, cityId: true } },
    person: { select: { id: true, name: true, cityId: true } },
} satisfies Prisma.AdministersSelect;

type GrantRowData = Prisma.AdministersGetPayload<{ select: typeof grantRowSelect }>;

export type GrantRow = GrantRowData & { status: GrantStatus };
/** `inviteEmailSent` is null when the account existed and no email was due. */
export type InvitedGrant = GrantRow & { inviteEmailSent: boolean | null };

/** The scopes a viewer may invite on: the realms, and the cities and bodies of those realms. */
export type GrantScopes = {
    realms: Realm[];
    cities: { id: string; name: string; realm: Realm }[];
    bodies: { id: string; name: string; cityId: string }[];
};

/**
 * How many people may hold a grant on one scope. Each invite of an unknown
 * email creates an account and sends an email, so an admin cannot fan that
 * out.
 */
export const MAX_GRANTS_PER_SCOPE = 20;

const refuse = (code: GrantErrorCode): BadRequestError => new BadRequestError(code);

const withStatus = (row: GrantRowData): GrantRow => ({ ...row, status: grantStatus(row) });

type Viewer = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function requireViewer(): Promise<{ viewer: Viewer; actor: Actor }> {
    const viewer = await getCurrentUser();
    if (!viewer) throw notAuthorizedError(false);
    return { viewer, actor: actorOf(viewer) };
}

/** The one scope of a row, as the columns name it. */
function scopeOfRow(row: Pick<GrantRowData, 'realm' | 'cityId' | 'partyId' | 'personId' | 'administrativeBodyId'>): GrantScope {
    if (row.realm) return { realm: row.realm };
    if (row.cityId) return { cityId: row.cityId };
    if (row.administrativeBodyId) return { administrativeBodyId: row.administrativeBodyId };
    if (row.partyId) return { partyId: row.partyId };
    if (row.personId) return { personId: row.personId };
    throw new Error('A grant row names no scope');
}

const lockOf = (scope: GrantScope): string => `grant:${Object.entries(scope).map(([key, value]) => `${key}:${value}`).join(':')}`;

/**
 * The scope as a target, with the realm of its city: a realm admin resolves
 * against it. Throws when the entity does not exist.
 */
async function targetOf(scope: GrantScope): Promise<Target> {
    if ('realm' in scope) return { level: 'realm', realm: scope.realm };
    if ('cityId' in scope) {
        const city = await prisma.city.findUnique({ where: { id: scope.cityId }, select: { realm: true } });
        if (!city) throw new NotFoundError('City not found');
        return { level: 'city', realm: city.realm, cityId: scope.cityId };
    }
    const cityWithRealm = { select: { cityId: true, city: { select: { realm: true } } } } as const;
    if ('administrativeBodyId' in scope) {
        const body = await prisma.administrativeBody.findUnique({ where: { id: scope.administrativeBodyId }, ...cityWithRealm });
        if (!body) throw new NotFoundError('Administrative body not found');
        return { level: 'body', realm: body.city.realm, cityId: body.cityId, bodyId: scope.administrativeBodyId };
    }
    if ('partyId' in scope) {
        const party = await prisma.party.findUnique({ where: { id: scope.partyId }, ...cityWithRealm });
        if (!party) throw new NotFoundError('Party not found');
        return { level: 'party', realm: party.city.realm, cityId: party.cityId, partyId: scope.partyId };
    }
    const person = await prisma.person.findUnique({
        where: { id: scope.personId },
        select: { cityId: true, city: { select: { realm: true } }, roles: { select: { administrativeBodyId: true } } },
    });
    if (!person) throw new NotFoundError('Person not found');
    return {
        level: 'person',
        realm: person.city.realm,
        cityId: person.cityId,
        personId: scope.personId,
        roleBodyIds: person.roles.map((role) => role.administrativeBodyId),
    };
}

/** The scope above the target: the city of a body, a party or a person; the realm of a city; the global scope of a realm. */
function parentOf(target: Target): Target {
    switch (target.level) {
        case 'global':
        case 'realm':
            return { level: 'global' };
        case 'city':
            return target.realm ? { level: 'realm', realm: target.realm } : { level: 'global' };
        default:
            return { level: 'city', realm: target.realm, cityId: target.cityId };
    }
}

/** Whether the viewer may read the grants on every realm of the filter. */
function mayListRealms(actor: Actor, realms: Realm[] | null): boolean {
    if (actor.isSuperAdmin) return true;
    if (realms === null) return false;
    const held = new Set(adminRealms(actor));
    return realms.length > 0 && realms.every((realm) => held.has(realm));
}

/** The rows whose scope is in the realms: the realm itself, its cities, and what hangs off them. */
function inRealms(realms: Realm[]): Prisma.AdministersWhereInput {
    const city = { realm: { in: realms } };
    return {
        OR: [
            { realm: { in: realms } },
            { city },
            { administrativeBody: { city } },
            { party: { city } },
            { person: { city } },
        ],
    };
}

/** The rows whose scope is the city, or a body, a party or a person of it. */
function inCity(cityId: string): Prisma.AdministersWhereInput {
    return {
        OR: [
            { cityId },
            { administrativeBody: { cityId } },
            { party: { cityId } },
            { person: { cityId } },
        ],
    };
}

/**
 * The grants in the viewer's reach: everything for a superadmin (`realms`
 * null), else the realms named, each of which the viewer must administer.
 * `cityId` narrows to one city, and opens the list to an admin of that city.
 * Active rows first, then the revoked ones when asked, newest first. People
 * only: a machine account's grants change on the machine accounts page.
 */
export async function listGrants(filter: { realms: Realm[] | null; cityId?: string; includeRevoked?: boolean }): Promise<GrantRow[]> {
    const { actor } = await requireViewer();
    const { realms, cityId, includeRevoked = false } = filter;

    if (cityId) {
        if (!resolve(actor, 'admin', await targetOf({ cityId }))) throw new ForbiddenError();
    } else if (!mayListRealms(actor, realms)) {
        throw new ForbiddenError();
    }

    const rows = await prisma.administers.findMany({
        where: {
            AND: [
                { user: peopleOnly },
                includeRevoked ? {} : { revokedAt: null },
                realms === null ? {} : inRealms(realms),
                cityId ? inCity(cityId) : {},
            ],
        },
        select: grantRowSelect,
        orderBy: { createdAt: 'desc' },
    });
    const live = rows.filter((row) => !row.revokedAt);
    const revoked = rows.filter((row) => row.revokedAt);
    return [...live, ...revoked].map(withStatus);
}

/** The scopes the viewer may pick in the invite dialog. */
export async function listGrantScopes(realms: Realm[] | null): Promise<GrantScopes> {
    const { actor } = await requireViewer();
    if (!mayListRealms(actor, realms)) throw new ForbiddenError();

    const cityWhere = realms === null ? {} : { realm: { in: realms } };
    const byName = { name: 'asc' } as const;
    const [cities, bodies] = await Promise.all([
        prisma.city.findMany({ where: cityWhere, select: { id: true, name: true, realm: true }, orderBy: byName }),
        prisma.administrativeBody.findMany({ where: { city: cityWhere }, select: { id: true, name: true, cityId: true }, orderBy: byName }),
    ]);
    return { realms: realms ?? ALL_REALMS, cities, bodies };
}

/**
 * Give an account a role on a scope. An unknown email gets a new account and
 * an invite email with a sign-in link; a known account only gets the row.
 * `request` repoints the link at the host the viewer invites from, as the
 * user tools do (see sendInviteEmail).
 */
export async function inviteGrant(
    input: { email: string; name?: string | null; role: GrantRole; scope: GrantScope },
    request?: Request,
): Promise<InvitedGrant> {
    const { viewer, actor } = await requireViewer();
    const { role, scope } = input;
    if (!canGrant(actor, await targetOf(scope))) throw new ForbiddenError();

    const email = normalizeEmail(input.email);
    if (!email) throw new BadRequestError('Email cannot be empty');
    // Only a superadmin gives a machine account rights.
    if (isMachineAccountAddress(email)) throw refuse('machine-address');
    const name = input.name?.trim() || null;

    // One transaction per invite, holding a lock on the scope: the count, the
    // account and the row are read and written under the same lock, so
    // concurrent invites to one scope run one after the other and the cap
    // holds. An advisory lock, not a row lock: a realm has no row to lock.
    const grant = () => prisma.$transaction(async (tx) => {
        await lockKey(tx, lockOf(scope));
        const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (existing && await tx.administers.findFirst({ where: { userId: existing.id, role, ...scope, ...activeGrantWhere }, select: { id: true } })) {
            throw refuse('duplicate');
        }
        // The cap counts people, not rows: a second role of a holder is free.
        const holders = await tx.administers.findMany({
            where: { ...scope, ...activeGrantWhere, user: peopleOnly },
            select: { userId: true },
            distinct: ['userId'],
        });
        const holds = existing !== null && holders.some((holder) => holder.userId === existing.id);
        if (!holds && holders.length >= MAX_GRANTS_PER_SCOPE) throw refuse('cap');
        const user = existing ?? await tx.user.create({ data: { email, name }, select: { id: true } });
        const row = await tx.administers.create({
            data: { role, ...scope, userId: user.id, grantedById: viewer.id, acceptedAt: new Date() },
            select: grantRowSelect,
        });
        return { row, created: !existing };
    });

    // The lock serializes invites to one scope only. The same new email invited
    // to two scopes at once fails one account create on the unique email,
    // which aborts that transaction; run it again, and it finds the account.
    const { row, created } = await grant().catch((error: unknown) => {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        return grant();
    });

    const inviteEmailSent = created ? await sendInviteEmail(email, name, request) : null;

    return { ...withStatus(row), inviteEmailSent };
}

/**
 * Take a grant back. The row stays, marked revoked, and the account keeps
 * whatever else it holds. A claimed row (the person's own account, see
 * claimPerson) is a superadmin's to remove, on the users page. The last
 * active admin of a scope goes only by an admin of the scope above: a body
 * admin cannot lock the body's own door.
 */
export async function revokeGrant(grantId: string): Promise<void> {
    const { viewer, actor } = await requireViewer();
    const row = await prisma.administers.findUnique({
        where: { id: grantId },
        select: {
            id: true, role: true, realm: true, cityId: true, partyId: true, personId: true, administrativeBodyId: true,
            claimedAt: true, acceptedAt: true, revokedAt: true, createdAt: true, user: { select: { isMachine: true } },
        },
    });
    if (!row || row.revokedAt || row.user.isMachine) throw new NotFoundError('Grant not found');

    const scope = scopeOfRow(row);
    const target = await targetOf(scope);
    if (!canGrant(actor, target)) throw new ForbiddenError();
    if (row.claimedAt) throw refuse('claimed');
    const fromAbove = resolve(actor, 'admin', parentOf(target));

    await prisma.$transaction(async (tx) => {
        // The same lock as the invite: two admins who revoke each other at
        // once must not both count two admins and leave none.
        await lockKey(tx, lockOf(scope));
        if (row.role === 'admin' && grantStatus(row) === 'active' && !fromAbove) {
            const others = await tx.administers.count({
                where: { ...scope, ...activeGrantWhere, role: 'admin', id: { not: row.id }, user: peopleOnly },
            });
            if (others === 0) throw refuse('last-admin');
        }
        // The row was read before the lock: a second revoke of the same row
        // finds it revoked here. claimPerson does not take this lock, so a
        // claim of the row meanwhile shows up here too.
        const { count } = await tx.administers.updateMany({
            where: { id: row.id, revokedAt: null, claimedAt: null },
            data: { revokedAt: new Date(), revokedById: viewer.id },
        });
        if (count === 0) {
            const now = await tx.administers.findUnique({ where: { id: row.id }, select: { claimedAt: true, revokedAt: true } });
            if (now?.claimedAt && !now.revokedAt) throw refuse('claimed');
            throw new NotFoundError('Grant not found');
        }
    });
}
