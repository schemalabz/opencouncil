/**
 * Locale configuration shared by next-intl's routing (`routing.ts`) and pure
 * modules that must not pull in next-intl (the proxy's SEO helpers, tests).
 * Keep this file dependency-free.
 */

// `sr` is Serbian Cyrillic (CLDR's default script for bare `sr`); `sr-Latn` is
// Serbian Latin, whose UI catalog is generated from the Cyrillic one
// (scripts/generate-sr-latn.ts).
export const LOCALES = ['en', 'el', 'fr', 'sr', 'sr-Latn'] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'el';

/**
 * Custom URL prefixes (with leading slash, next-intl's format) for locales
 * whose id would make an awkward path segment. sr-Latn lives at /lat, matching
 * Serbian web convention for script toggles.
 */
export const LOCALE_URL_PREFIXES: Partial<Record<AppLocale, string>> = {
    'sr-Latn': '/lat',
};

/**
 * URL path prefix for a locale (without slashes): the custom prefix when one
 * is configured (`sr-Latn` → `lat`), else the locale id itself. Anything
 * matching URL prefixes (the proxy, redirect regexes, embed-path detection)
 * must go through this rather than using locale ids directly.
 */
export function urlPrefixForLocale(locale: string): string {
    return LOCALE_URL_PREFIXES[locale as AppLocale]?.replace(/^\//, '') ?? locale;
}

/**
 * Regex alternation of every locale's URL prefix (`en|el|fr|sr|lat`), for
 * path-prefix matching in the proxy and route regexes. `next.config.mjs` must
 * inline the same set (it can't import TS); a test guards against drift.
 */
export const localePrefixPattern = LOCALES.map(urlPrefixForLocale).join('|');

/**
 * Canonical BCP 47 tag (language-script-region) per app locale — the single
 * place a new locale's full identity is declared. `Intl` consumers
 * (`getIntlLocale` in formatters/time.ts) use it directly; derived formats
 * (`getOgLocale`) are computed from it. Typed against `AppLocale` so adding a
 * locale to `LOCALES` fails compilation until its tag is declared.
 */
export const LOCALE_TAGS: Record<AppLocale, string> = {
    el: 'el-GR',
    en: 'en-US',
    fr: 'fr-FR',
    sr: 'sr-Cyrl-RS',
    'sr-Latn': 'sr-Latn-RS',
};

/**
 * The `og:locale` value for an app locale, for `generateMetadata`: `ll_CC`
 * per the OG protocol (underscore, no script subtag — both Serbian scripts
 * yield sr_RS). Derived from `LOCALE_TAGS`, so new locales get it for free.
 */
export function getOgLocale(locale: string): string {
    const tag = new Intl.Locale(LOCALE_TAGS[locale as AppLocale] ?? LOCALE_TAGS[DEFAULT_LOCALE]);
    return tag.region ? `${tag.language}_${tag.region}` : tag.language;
}
