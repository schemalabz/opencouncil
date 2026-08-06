import { AsyncLocalStorage } from 'node:async_hooks';
import { Realm } from '@prisma/client';
import { getRealmBaseUrl } from '@/lib/realm';

/**
 * The realm a request arrived on, resolved once in the route handler and read
 * anywhere below it. An MCP URL belongs to one realm (opencouncil.gr vs .fr vs
 * .rs), and every list, filter and cited URL has to respect that.
 *
 * Async-local rather than a parameter so the tool implementations stay
 * synchronous where they build URLs; `getRealm()` itself can only be called in
 * a request scope, which the handler is and the tool callbacks may not be.
 */
export type McpRequestContext = {
    realm: Realm;
    /** Origin the client actually reached us on, so cited links stay on it. */
    origin: string;
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

/** Build the request context from the incoming Host, for the route handler. */
export function requestContext(realm: Realm, host: string | null): McpRequestContext {
    if (!host) return { realm, origin: getRealmBaseUrl(realm) };
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
    return { realm, origin: `${isLocal ? 'http' : 'https'}://${host}` };
}
