import { Metadata } from 'next';
import { getRealmBaseUrl, REALMS } from '@/lib/realm';
import { getRealm } from '@/lib/realm.server';

/**
 * Builds canonical + hreflang alternates for a page, scoped to the request's
 * realm (resolved from the Host header).
 *
 * Each realm self-references its own domain only — a city/meeting page exists in
 * exactly one realm, so there is no cross-domain (`.gr`↔`.fr`) hreflang cluster.
 * The realm's default locale is served unprefixed (`/path`); English lives at
 * `/en/path`. `x-default` points at the default-locale URL. Each locale
 * self-references its own canonical to avoid contradicting the hreflang cluster.
 *
 * - greece → `el` (default, unprefixed) + `en`, on `https://opencouncil.gr`
 * - france → `fr` (default, unprefixed) + `en`, on `https://opencouncil.fr`
 *
 * @param path locale-agnostic path beginning with `/`, or `''` for the homepage
 * @param locale current request locale (`'el'` | `'en'` | `'fr'`)
 */
export async function buildHreflangAlternates(path: string, locale: string): Promise<Metadata['alternates']> {
    const realm = await getRealm();
    const baseUrl = getRealmBaseUrl(realm);
    const defaultLocale = REALMS[realm].defaultLocale;

    const defaultUrl = `${baseUrl}${path}`;
    const enUrl = `${baseUrl}/en${path}`;

    return {
        canonical: locale === 'en' ? enUrl : defaultUrl,
        languages: {
            [defaultLocale]: defaultUrl,
            en: enUrl,
            'x-default': defaultUrl,
        },
    };
}
