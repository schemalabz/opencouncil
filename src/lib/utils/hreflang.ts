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
 * its own `og:url`, such as a shared excerpt, keeps it.
 *
 * @param path locale-agnostic path beginning with `/`, or `''` for the homepage
 */
export async function withCanonicalUrl(path: string, metadata: Metadata): Promise<Metadata> {
    const canonical = `${getRealmBaseUrl(await getRealm())}${path}`;
    return {
        ...metadata,
        alternates: { ...metadata.alternates, canonical },
        openGraph: { url: canonical, ...(metadata.openGraph ?? siteOpenGraph) },
    };
}
