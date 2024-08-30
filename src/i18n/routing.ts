import { defineRouting } from 'next-intl/routing';
import { createSharedPathnamesNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
    // A list of all locales that are supported
    locales: ['en', 'el'],

    // Used when no locale matches
    defaultLocale: 'el',

    // Don't show the default locale in the URL
    localePrefix: 'as-needed',
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter } =
    createSharedPathnamesNavigation(routing);