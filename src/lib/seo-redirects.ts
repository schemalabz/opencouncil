import { Realm } from '@prisma/client';
import { REALMS, foreignLocalesForRealm, isKnownRealmHost, realmForHost } from '@/lib/realm';
import { localePrefixPattern, urlPrefixForLocale } from '@/i18n/config';
import { type SerbianScript } from '@/lib/serbian/transliterate';
import { EMBED_PATH } from '@/lib/utils/embed';

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
 * realm host (`/fr/x` on `.gr` → `/x`, `/el/x` on `.fr` → `/x`, `/lat/x` on
 * `.gr` → `/x`), else null. Kills the orphaned duplicate tree the foreign
 * locale creates (it has no hreflang entry and no UI entry point).
 *
 * - Only on known realm hosts, so localhost keeps serving all locale prefixes
 *   for development — unless `realmOverride` is set (the `?realm=` escape
 *   hatch, see `realmOverride` in `realm.ts`), in which case the host is
 *   treated as that realm's host so the emulation is faithful everywhere.
 * - The realm's own default prefix (`/el` on `.gr`) is next-intl's job — its
 *   middleware already redirects it away. `/en` intentionally keeps serving
 *   200 (it canonicalizes to the default-locale URL instead).
 */
export function foreignLocaleRedirectPath(
    host: string | null | undefined,
    pathname: string,
    realmOverride?: Realm,
): string | null {
    if (realmOverride === undefined && !isKnownRealmHost(host)) return null;
    const realm = realmOverride ?? realmForHost(host);
    for (const locale of foreignLocalesForRealm(realm)) {
        const prefix = urlPrefixForLocale(locale);
        if (pathname === `/${prefix}`) return '/';
        if (pathname.startsWith(`/${prefix}/`)) return pathname.slice(prefix.length + 1);
    }
    return null;
}

/**
 * Cookie persisting the reader's Serbian script choice across navigations.
 * Set by the Ћир | Lat switcher (and refreshed by the proxy on explicit /lat
 * visits); read only by the proxy. Values: 'latn' | 'cyrl'. Meaningless
 * outside the serbia realm.
 */
export const SERBIAN_SCRIPT_COOKIE = 'oc-script';

/** Any explicit locale URL prefix (/en, /el, /fr, /sr, /lat). Shared with the proxy. */
export const LOCALE_PREFIX_RE = new RegExp(`^/(${localePrefixPattern})(/|$)`);

const latPrefix = () => `/${urlPrefixForLocale('sr-Latn')}`;
const inLatTree = (pathname: string) => {
    const prefix = latPrefix();
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
};

/**
 * Path to 302 to when a reader who chose Latin script (cookie `latn`) hits an
 * unprefixed URL on the serbia realm, else null. Serbian is digraphic and the
 * script variant lives in the URL (`/lat` prefix ↔ `sr-Latn`), so without
 * this any link to an unprefixed URL — internal navigation, bookmarks, shared
 * links — silently reverts the reader to Cyrillic.
 *
 * - Cookie-gated, so crawlers (cookieless) always see the canonical tree:
 *   unprefixed Cyrillic, with the /lat variant canonicalised back to it (no
 *   hreflang cluster is emitted anywhere — see `buildCanonicalAlternates`).
 *   A 302 rather than a 301 because the response varies by cookie, so it must
 *   never be treated as permanent; no effect on indexing either way.
 * - Any explicit locale prefix wins over the cookie (`/lat` needs no
 *   redirect; `/en` stays the escape hatch into English). The reverse choice
 *   needs no redirect at all: Ћир sets the cookie to 'cyrl' and unprefixed
 *   URLs already serve Cyrillic.
 * - Embed routes are exempt: their URL is chosen by the embedding site's
 *   configurator, and iframe content must not vary with the viewer's
 *   site-wide preference (the /lat/embed variants also carry public cache
 *   headers).
 * - The caller gates on page-navigation requests (GET/HEAD + app path):
 *   redirecting a server-action POST would break it.
 */
export function serbianScriptRedirectPath(
    realm: Realm,
    pathname: string,
    scriptCookie: string | undefined,
): string | null {
    if (realm !== 'serbia' || scriptCookie !== 'latn') return null;
    if (LOCALE_PREFIX_RE.test(pathname) || EMBED_PATH.test(pathname)) return null;
    return pathname === '/' ? latPrefix() : `${latPrefix()}${pathname}`;
}

/**
 * The cookie value to persist when serving this request, or null. Entering
 * the /lat tree by any route (external link, share) adopts Latin as the
 * reader's choice, so onward navigation through unprefixed links keeps the
 * script (see `serbianScriptRedirectPath`). Unprefixed visits deliberately
 * adopt nothing: with a 'latn' cookie they never get here (redirected), and
 * without one the Cyrillic default needs no cookie — only the switcher's
 * `?script=cyrl` sets 'cyrl'.
 *
 * Embed routes are exempt for the same reasons as the redirect — plus the
 * reverse concern: an iframe on some third-party page must not silently set
 * a site-wide preference the reader never chose.
 */
export function serbianScriptAdoption(
    realm: Realm,
    pathname: string,
    scriptCookie: string | undefined,
): SerbianScript | null {
    if (realm !== 'serbia' || scriptCookie === 'latn') return null;
    if (!inLatTree(pathname) || EMBED_PATH.test(pathname)) return null;
    return 'latn';
}

/**
 * Where the `?script=` consumer should land after persisting the choice: the
 * URL is made to agree with the script it asked for, in one hop. Without
 * this, `/lat/x?script=cyrl` (hand-written or shared — the switcher never
 * builds it) would set 'cyrl' and then bounce the reader straight back into
 * /lat via the adoption above, i.e. do the opposite of what it says.
 * Explicit non-Serbian prefixes (/en) are left alone in both directions.
 */
export function serbianScriptParamTarget(pathname: string, script: SerbianScript): string {
    if (script === 'cyrl') {
        if (!inLatTree(pathname)) return pathname;
        const stripped = pathname.slice(latPrefix().length);
        return stripped === '' ? '/' : stripped;
    }
    if (inLatTree(pathname) || LOCALE_PREFIX_RE.test(pathname)) return pathname;
    return pathname === '/' ? latPrefix() : `${latPrefix()}${pathname}`;
}
