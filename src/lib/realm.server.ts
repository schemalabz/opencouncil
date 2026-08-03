// Server-only by convention: uses next/headers, so it can only run in a request
// scope (server components / route handlers / generateMetadata). Keep it out of
// client bundles and out of unstable_cache callbacks.
import { cookies, headers } from 'next/headers';
import { Realm } from '@prisma/client';
import { REALM_OVERRIDE_COOKIE, effectiveRealm, getRealmBaseUrl } from './realm';

/**
 * Resolves the current request's realm from its Host header, honoring the
 * `oc-realm` override cookie on non-production hosts (the `?realm=` escape
 * hatch for previews/localhost — see `realmOverride` in `realm.ts`).
 *
 * Server-only: reads `headers()`, so it cannot be called inside `unstable_cache`
 * (`createCache`). Resolve realm at the call site (server component / route
 * handler / `generateMetadata`) and pass it into cached functions as an explicit
 * argument folded into the cache key.
 *
 * The `.fr`-host rewrite in `proxy.ts` preserves the original Host header, so this
 * returns `france` for `.fr` requests even though the path was rewritten to `/fr`.
 */
export async function getRealm(): Promise<Realm> {
    const host = (await headers()).get('host');
    const overrideCookie = (await cookies()).get(REALM_OVERRIDE_COOKIE)?.value;
    return effectiveRealm(host, overrideCookie);
}

/** Canonical absolute base URL for the current request's realm. */
export async function getRealmBaseUrlFromRequest(): Promise<string> {
    return getRealmBaseUrl(await getRealm());
}
