import { REALMS, foreignLocalesForRealm, isKnownRealmHost, realmForHost } from '@/lib/realm';

/**
 * SEO-motivated redirect decisions for the proxy. Pure module (no
 * `next/headers`/server-only imports), safe for the edge/middleware bundle —
 * same constraints as `realm.ts`.
 */

/**
 * Absolute redirect target when the request arrived on `www.<realm-domain>`
 * (exactly — nested subdomains like preview hosts are left alone), else null.
 * The www hosts serve the full site as a duplicate of the apex, so the proxy
 * 301s them to consolidate indexing on the apex domain.
 *
 * Trailing slashes are stripped here too, so `www.../athens/` reaches the
 * apex in one hop instead of chaining into the proxy's trailing-slash 308.
 *
 * @param pathname request path, e.g. `/athens/`
 * @param search query string including `?`, or `''`
 */
export function wwwRedirectTarget(host: string | null | undefined, pathname: string, search: string): string | null {
    const normalized = (host ?? '').split(':')[0].toLowerCase();
    for (const { domain } of Object.values(REALMS)) {
        if (normalized === `www.${domain}`) {
            const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
            return `https://${domain}${path}${search}`;
        }
    }
    return null;
}

/**
 * Path to 301 to when the request carries a foreign locale prefix on a known
 * realm host (`/fr/x` on `.gr` → `/x`, `/el/x` on `.fr` → `/x`), else null.
 * Kills the orphaned duplicate tree the foreign locale creates (it has no
 * hreflang entry and no UI entry point).
 *
 * - Only on known realm hosts, so localhost keeps serving all locale prefixes
 *   for development.
 * - The realm's own default prefix (`/el` on `.gr`) is next-intl's job — its
 *   middleware already redirects it away. `/en` intentionally keeps serving
 *   200 (it canonicalizes to the default-locale URL instead).
 */
export function foreignLocaleRedirectPath(host: string | null | undefined, pathname: string): string | null {
    if (!isKnownRealmHost(host)) return null;
    const realm = realmForHost(host);
    for (const locale of foreignLocalesForRealm(realm)) {
        if (pathname === `/${locale}`) return '/';
        if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
    }
    return null;
}
