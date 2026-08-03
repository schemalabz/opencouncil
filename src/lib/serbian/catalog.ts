import { cyrillicToLatin } from './transliterate';

/**
 * Derives a Serbian Latin (sr-Latn) message catalog from a Cyrillic (sr) one
 * by transliterating every string value; keys and structure are untouched.
 *
 * The transform is the raw Cyrillic→Latin character map, whose domain is
 * exclusively Cyrillic code points — ICU MessageFormat syntax ({placeholders},
 * plural/select keywords, #, tags) is ASCII and provably untouched, while
 * Cyrillic literals inside nested plural branches convert correctly. That is
 * why sr-Latn needs no catalog files of its own: the i18n request config
 * (src/i18n/request.ts) derives it from the sr catalogs at load time.
 */
export function transliterateCatalog(value: unknown): unknown {
    if (typeof value === 'string') return cyrillicToLatin(value);
    if (Array.isArray(value)) return value.map(transliterateCatalog);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, transliterateCatalog(v)]));
    }
    return value;
}
