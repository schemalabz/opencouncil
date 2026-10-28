import { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { urlPrefixForLocale } from '@/i18n/config';
import { siteOpenGraph } from '@/lib/og/siteOpenGraph';
import { REALMS, getRealmBaseUrl } from '@/lib/realm';
import { getRealm } from '@/lib/realm.server';

/**
 * Gives a page its canonical URL, scoped to the request's realm (resolved
 * from the Host header), as both `<link rel="canonical">` and `og:url`.
 *
 * Every locale variant of a page canonicalizes to the realm's default-locale
 * (unprefixed) URL: a non-default locale's pages (`/en` on opencouncil.gr) are
 * intentionally deindexed — Google was serving them to Greek searchers — so no
 * hreflang cluster is emitted, only `canonical`.
 *
 * - greece → `https://opencouncil.gr{path}`
 * - france → `https://opencouncil.fr{path}`
 *
 * Facebook keys a link preview on `og:url`. The city notifications pages once
 * inherited the homepage's `og:url`, and Facebook kept showing the homepage's
 * preview for them after they stopped. A page without its own `openGraph`
 * gets the site-wide one, so that it can state its URL too. A page that sets
 * its own `og:url` keeps it.
 *
 * Facebook also follows `og:url` and shows the card of the page it names. A
 * query parameter that changes what a reader gets, such as a shared
 * contribution or a video timestamp, therefore stays in `og:url`, although
 * the canonical drops it. The locale prefix stays in `og:url` too: an `/en`
 * share keeps its English card, although the canonical names the Greek page.
 *
 * @param path locale-agnostic path beginning with `/`, or `''` for the homepage
 * @param shareState query parameters that `og:url` keeps; undefined ones are left out
 */
export async function withCanonicalUrl(
    path: string,
    metadata: Metadata,
    shareState: Record<string, string | undefined> = {},
): Promise<Metadata> {
    const [realm, locale] = await Promise.all([getRealm(), getLocale()]);
    const base = getRealmBaseUrl(realm);
    const canonical = `${base}${path}`;
    // On its realm's domain the default locale has no prefix: /fr pages are served at opencouncil.fr/.
    const sharedPage = locale === REALMS[realm].defaultLocale ? canonical : `${base}/${urlPrefixForLocale(locale)}${path}`;
    const query = new URLSearchParams(
        Object.entries(shareState).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ).toString();
    return {
        ...metadata,
        alternates: { ...metadata.alternates, canonical },
        openGraph: { url: query ? `${sharedPage}?${query}` : sharedPage, ...(metadata.openGraph ?? siteOpenGraph) },
    };
}

/**
 * The canonical alone, without `og:url`, for a layout that serves several
 * URLs whose query it cannot read. Facebook then keys a share on the URL that
 * was shared, query included.
 */
export async function buildCanonicalAlternates(path: string): Promise<Metadata['alternates']> {
    return { canonical: await realmUrl(path) };
}

async function realmUrl(path: string) {
    return `${getRealmBaseUrl(await getRealm())}${path}`;
}
