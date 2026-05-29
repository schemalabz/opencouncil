import { Metadata } from 'next';
import { env } from '@/env.mjs';

const baseUrl = env.NEXTAUTH_URL;

/**
 * Builds canonical + hreflang alternates for a page.
 *
 * Greek is the default locale and served unprefixed (`/path`); English lives at
 * `/en/path`. `x-default` points at the Greek URL so search engines surface the
 * Greek variant by default. Each locale self-references its own canonical to
 * avoid sending Google a canonical signal that contradicts the hreflang cluster.
 *
 * @param path locale-agnostic path beginning with `/`, or `''` for the homepage
 * @param locale current request locale (`'el'` | `'en'`)
 */
export function buildHreflangAlternates(path: string, locale: string): Metadata['alternates'] {
    const elUrl = `${baseUrl}${path}`;
    const enUrl = `${baseUrl}/en${path}`;

    return {
        canonical: locale === 'en' ? enUrl : elUrl,
        languages: {
            el: elUrl,
            en: enUrl,
            'x-default': elUrl,
        },
    };
}
