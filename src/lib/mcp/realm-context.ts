import { AsyncLocalStorage } from 'node:async_hooks';
import { Realm } from '@prisma/client';
import { getRealmBaseUrl, isRealmApexHost } from '@/lib/realm';
import type { McpIdentity } from './auth';
import type { McpAdminAccess } from './adminAccess';

/**
 * The realm a request arrived on, resolved once in the route handler and read
 * anywhere below it. An MCP URL belongs to one realm (opencouncil.gr vs .fr vs
 * .rs), and every list, filter and cited URL has to respect that. A superadmin
 * still reaches the cities of every realm by id (reachesEveryRealm).
 *
 * Async-local rather than a parameter so the tool implementations stay
 * synchronous where they build URLs; `getRealm()` itself can only be called in
 * a request scope, which the handler is and the tool callbacks may not be.
 */
export type McpRequestContext = {
    realm: Realm;
    /** Origin the client actually reached us on, so cited links stay on it. */
    origin: string;
    /**
     * Who the request's token resolved to, or null for anonymous. Present so
     * per-request tool registration can vary by caller — tool handlers keep
     * reading identity from their ServerContext instead.
     */
    identity: McpIdentity;
    /**
     * What the identity may administer, resolved once in the route handler for
     * the same reason: tool registration is synchronous. Null withholds the
     * admin tools. Tool handlers resolve it again for themselves.
     */
    adminAccess: McpAdminAccess | null;
    /**
     * The realm of each city a guard let through in this request, so links to
     * a city of another realm go to that realm's domain (see cityBaseUrl).
     */
    cityRealms: Map<string, Realm>;
};

export const mcpRealmStore = new AsyncLocalStorage<McpRequestContext>();

/** The current request's realm, defaulting rather than throwing if unset. */
export function currentRealm(): Realm {
    return mcpRealmStore.getStore()?.realm ?? Realm.greece;
}

/**
 * Base URL for links we hand back. The request's own origin, so a connector
 * added on opencouncil.fr cites .fr and one added on a preview cites that
 * preview (rather than sending reviewers to production). Falls back to the
 * realm's canonical domain.
 */
export function currentBaseUrl(): string {
    return mcpRealmStore.getStore()?.origin ?? getRealmBaseUrl(currentRealm());
}

/**
 * Whether this request reaches the cities of every realm. A superadmin's does:
 * an MCP URL scopes what readers see to one realm, but a superadmin
 * administers every realm on the site, and adds cities to all of them from
 * one connection. Lists and searches stay on the request's realm.
 */
export function reachesEveryRealm(): boolean {
    return mcpRealmStore.getStore()?.adminAccess?.superadmin === true;
}

/** Record the realm of a city that a guard let through. */
export function rememberCityRealm(cityId: string, realm: Realm): void {
    mcpRealmStore.getStore()?.cityRealms.set(cityId, realm);
}

/**
 * Base URL for a link to a city. On a production domain, a city of another
 * realm is reachable only on that realm's domain, so its links go there. A
 * preview or a local server keeps its own origin, as realmBaseUrl does: the
 * link stays on the instance under review, and opens there only after
 * `?realm=<realm>` selects the city's realm. Every other city's links stay on
 * the request's origin (currentBaseUrl).
 */
export function cityBaseUrl(cityId: string): string {
    const origin = currentBaseUrl();
    const realm = mcpRealmStore.getStore()?.cityRealms.get(cityId);
    if (!realm || realm === currentRealm() || !isRealmApexHost(new URL(origin).hostname)) return origin;
    return getRealmBaseUrl(realm);
}

/** The current request's identity; null when anonymous or outside a request. */
export function currentMcpIdentity(): McpIdentity {
    return mcpRealmStore.getStore()?.identity ?? null;
}

/** The current request's admin access; null when there is none or outside a request. */
export function currentAdminAccess(): McpAdminAccess | null {
    return mcpRealmStore.getStore()?.adminAccess ?? null;
}

/** Build the request context from the incoming Host, for the route handler. */
export function requestContext(
    realm: Realm,
    host: string | null,
    identity: McpIdentity,
    { adminAccess = null }: { adminAccess?: McpAdminAccess | null } = {}
): McpRequestContext {
    const isLocal = host ? /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) : false;
    const origin = host ? `${isLocal ? 'http' : 'https'}://${host}` : getRealmBaseUrl(realm);
    return { realm, origin, identity, adminAccess, cityRealms: new Map() };
}
