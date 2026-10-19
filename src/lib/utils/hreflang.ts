import { Metadata } from 'next';
import { siteOpenGraph } from '@/lib/og/siteOpenGraph';
import { getRealmBaseUrl } from '@/lib/realm';
import { getRealm } from '@/lib/realm.server';

/**
 * Gives a page its canonical URL, scoped to the request's realm (resolved
 * from the Host header), as both `<link rel="canonical">` and `og:url`.
 *
 * Every locale variant of a page canonicalizes to the realm's default-locale
 * (unprefixed) URL: `/en` pages are intentionally deindexed — Google was
 * serving them to Greek searchers — so no hreflang cluster is emitted, only
 * `canonical`.
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
 * the canonical drops it.
 *
 * @param path locale-agnostic path beginning with `/`, or `''` for the homepage
 * @param shareState query parameters that `og:url` keeps; undefined ones are left out
 */
export async function withCanonicalUrl(
    path: string,
    metadata: Metadata,
    shareState: Record<string, string | undefined> = {},
): Promise<Metadata> {
    const canonical = await realmUrl(path);
    const query = new URLSearchParams(
        Object.entries(shareState).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ).toString();
    return {
        ...metadata,
        alternates: { ...metadata.alternates, canonical },
        openGraph: { url: query ? `${canonical}?${query}` : canonical, ...(metadata.openGraph ?? siteOpenGraph) },
    };
}

async function realmUrl(path: string) {
    return `${getRealmBaseUrl(await getRealm())}${path}`;
}
