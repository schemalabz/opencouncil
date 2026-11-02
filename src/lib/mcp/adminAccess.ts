import "server-only";
import type { Realm } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';
import { adminRealms, roleHasRight, type ActiveGrant, type Right } from '@/lib/auth/rights';
import { hasRightOn, loadActor, type LoadedActor } from '@/lib/auth/grants.server';
import type { McpIdentity } from './auth';
import { mcpRealmStore } from './realm-context';

/**
 * Who the caller is to the MCP admin tools: the owner of the token as an
 * actor of the rights model (#875). `null` means no admin tools at all.
 *
 * A token carries the rights of its owner on the site, read from the
 * database at each request: the same account, the same rights, on the admin
 * pages and through an assistant.
 */
export type McpAdminAccess = LoadedActor;

/** The rights the admin suite exercises. A grant with none of them gets no admin tool. */
const ADMIN_SUITE_RIGHTS: Right[] = ['meeting.manage', 'tasks.run'];

/** A grant on a realm, a city or a body whose role has a right of the suite. */
function opensAdminSuite(grant: ActiveGrant): boolean {
    const onCouncil = Boolean(grant.realm || grant.cityId || grant.administrativeBodyId);
    return onCouncil && ADMIN_SUITE_RIGHTS.some((right) => roleHasRight(grant.role, right));
}

export async function resolveAdminAccess(identity: McpIdentity): Promise<McpAdminAccess | null> {
    if (!identity) return null;
    const actor = await loadActor(identity.userId);
    if (!actor) return null;
    if (!actor.isSuperAdmin && !actor.grants.some(opensAdminSuite)) return null;
    return actor;
}

/**
 * Tool handlers call one of the guards below, whatever tools/list
 * advertised: a client can call a tool that was never advertised. The route
 * handler resolved the access from the database in this same request, so the
 * guards read it from the request context and query again only outside one.
 */
async function requireAdminAccess(identity: McpIdentity): Promise<McpAdminAccess> {
    if (!identity) {
        throw new UnauthorizedError('Authentication required: connect with a personal MCP URL from the /mcp page of the site, or with the token of a machine account.');
    }
    const store = mcpRealmStore.getStore();
    const access = store ? store.adminAccess : await resolveAdminAccess(identity);
    if (!access) throw new ForbiddenError('Your account has no administrator rights.');
    return access;
}

/** The right on a city. A body grant never passes this one. */
export async function requireCityRight(identity: McpIdentity, right: Right, cityId: string): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!(await hasRightOn(access, right, { cityId }))) {
        throw new ForbiddenError(`You do not administer ${cityId}.`);
    }
}

/** The right on a meeting: a grant on the city, or on the body that holds the meeting. */
export async function requireMeetingRight(identity: McpIdentity, right: Right, cityId: string, meetingId: string): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!(await hasRightOn(access, right, { cityId, councilMeetingId: meetingId }))) {
        throw new ForbiddenError(`You do not administer meeting ${meetingId} of ${cityId}.`);
    }
}

/** The right on a body of that city: a grant on the city, or on that body. */
export async function requireBodyRight(identity: McpIdentity, right: Right, cityId: string, bodyId: string): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!(await hasRightOn(access, right, { cityId, administrativeBodyId: bodyId }))) {
        throw new ForbiddenError(`You do not administer body ${bodyId} of ${cityId}.`);
    }
}

/** The right on a realm: a grant on that realm. A superadmin passes every realm. */
export async function requireRealmRight(identity: McpIdentity, right: Right, realm: Realm): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!(await hasRightOn(access, right, { realm }))) {
        throw new ForbiddenError(`You do not administer the ${realm} realm.`);
    }
}

/**
 * The realms the caller administers: null for a superadmin, who administers
 * every realm; the realms of their `admin` grants otherwise. Throws for a
 * caller who administers none.
 */
export async function requireAdminRealms(identity: McpIdentity): Promise<Realm[] | null> {
    const access = await requireAdminAccess(identity);
    if (access.isSuperAdmin) return null;
    const realms = adminRealms(access);
    if (realms.length === 0) throw new ForbiddenError('This operation needs the rights of a realm administrator.');
    return realms;
}

export async function requireSuperadmin(identity: McpIdentity): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!access.isSuperAdmin) throw new ForbiddenError('This operation needs superadmin rights.');
}
