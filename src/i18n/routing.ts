import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { DEFAULT_LOCALE, LOCALES, LOCALE_URL_PREFIXES } from './config';

export const routing = defineRouting({
    // A list of all locales that are supported (see config.ts for notes)
    locales: LOCALES,

    // Used when no locale matches
    defaultLocale: DEFAULT_LOCALE,

    // Don't show the default locale in the URL. sr-Latn gets a short custom
    // URL prefix (/lat), matching Serbian web convention for script toggles.
    localePrefix: { mode: 'as-needed', prefixes: LOCALE_URL_PREFIXES },

    // Disable automatic locale detection from Accept-Language header
    localeDetection: false,

    // Don't emit the hreflang `Link` response header (on by default). It
    // advertises every locale variant as a distinct indexable alternate, which
    // contradicts the canonical-to-default-locale scheme (hreflang via HTTP
    // header carries the same weight for Google as <link> tags or the sitemap).
    alternateLinks: false,
});

// Request header used to pass an explicit locale from the proxy to the root
// layout for requests on hosts whose realm default isn't the app default (.fr,
// .rs), which bypass next-intl's middleware. The root layout reads this for
// the <html lang> attribute. Our own header (rather than next-intl's internal
// one) so we don't depend on undocumented internals.
export const LOCALE_OVERRIDE_HEADER = 'x-opencouncil-locale';

// Re-exported for callers that already import from routing.ts; pure modules
// (seo-redirects, tests) should import from ./config directly to avoid
// pulling next-intl into their bundle.
export { localePrefixPattern, urlPrefixForLocale } from './config';

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);