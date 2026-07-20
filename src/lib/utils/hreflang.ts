import { Metadata } from 'next';
import { getRealmBaseUrl } from '@/lib/realm';
import { getRealm } from '@/lib/realm.server';

/**
 * Builds the canonical URL for a page, scoped to the request's realm (resolved
 * from the Host header).
 *
 * Every locale variant of a page canonicalizes to the realm's default-locale
 * (unprefixed) URL: `/en` pages are intentionally deindexed — Google was
 * serving them to Greek searchers — so no hreflang cluster is emitted, only
 * `canonical`.
 *
 * - greece → `https://opencouncil.gr{path}`
 * - france → `https://opencouncil.fr{path}`
 *
 * @param path locale-agnostic path beginning with `/`, or `''` for the homepage
 */
export async function buildCanonicalAlternates(path: string): Promise<Metadata['alternates']> {
    const realm = await getRealm();
    return { canonical: `${getRealmBaseUrl(realm)}${path}` };
}
