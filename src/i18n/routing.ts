import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
    // A list of all locales that are supported
    locales: ['en', 'el', 'fr'],

    // Used when no locale matches
    defaultLocale: 'el',

    // Don't show the default locale in the URL
    localePrefix: 'as-needed',

    // Disable automatic locale detection from Accept-Language header
    localeDetection: false,
});

// Request header used to pass an explicit locale from the proxy to the root
// layout for `.fr`-host requests, which bypass next-intl's middleware. The root
// layout reads this for the <html lang> attribute. Our own header (rather than
// next-intl's internal one) so we don't depend on undocumented internals.
export const LOCALE_OVERRIDE_HEADER = 'x-opencouncil-locale';

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
    createNavigation(routing);