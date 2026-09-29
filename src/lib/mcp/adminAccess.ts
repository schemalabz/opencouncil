import "server-only";
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';
import { getUserCityRights } from '@/lib/db/highlights-core';
import type { McpIdentity } from './auth';
import { mcpRealmStore } from './realm-context';

/**
 * What the caller may administer through the MCP admin tools. `null` means no
 * admin tools at all.
 *
 * A service key is a superadmin. A personal token carries the rights of its
 * owner on the site, read from the database at each request: the same
 * account, the same rights, on the admin pages and through an assistant.
 */
export type McpAdminAccess = { superadmin: boolean; cityIds: ReadonlySet<string> };

export async function resolveAdminAccess(identity: McpIdentity): Promise<McpAdminAccess | null> {
    if (!identity) return null;
    if (identity.type === 'service') return { superadmin: true, cityIds: new Set() };

    const rights = await getUserCityRights(identity.userId);
    if (!rights.all && rights.cityIds.size === 0) return null;
    return { superadmin: rights.all, cityIds: rights.cityIds };
}

/**
 * Tool handlers call one of the two guards below, whatever tools/list
 * advertised: a client can call a tool that was never advertised. The route
 * handler resolved the access from the database in this same request, so the
 * guards read it from the request context and query again only outside one.
 */
async function requireAdminAccess(identity: McpIdentity): Promise<McpAdminAccess> {
    if (!identity) {
        throw new UnauthorizedError('Authentication required: connect with a personal MCP URL from the /mcp page of the site.');
    }
    const store = mcpRealmStore.getStore();
    const access = store ? store.adminAccess : await resolveAdminAccess(identity);
    if (!access) throw new ForbiddenError('Your account has no administrator rights.');
    return access;
}

export async function requireCityAdmin(identity: McpIdentity, cityId: string): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!access.superadmin && !access.cityIds.has(cityId)) {
        throw new ForbiddenError(`You do not administer ${cityId}.`);
    }
}

export async function requireSuperadmin(identity: McpIdentity): Promise<void> {
    const access = await requireAdminAccess(identity);
    if (!access.superadmin) throw new ForbiddenError('This operation needs superadmin rights.');
}
