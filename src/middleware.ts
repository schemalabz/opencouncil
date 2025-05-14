import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from './auth'

const i18nMiddleware = createIntlMiddleware(routing, { localeDetection: false });

export default async function middleware(req: NextRequest) {
    // Basic auth check
    if (!isHttpBasicAuthAuthenticated(req)) {
        return new NextResponse('Authentication required', {
            status: 401,
            headers: { 'WWW-Authenticate': 'Basic' },
        });
    }

    // Handle the specific case for opencouncil.chania.gr
    const chaniaResponse = handleChaniaSubdomain(req);
    if (chaniaResponse) return chaniaResponse;

    // Handle i18n first
    const pathname = req.nextUrl.pathname;
    if (/^\/(?!api|_next|_vercel|\..+).*/.test(pathname)) {
        const response = await i18nMiddleware(req);
        if (response) return response;
    }

    return auth(req as any);
}

export const config = {
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

function isHttpBasicAuthAuthenticated(req: Request) {
    if (!process.env.BASIC_AUTH_USERNAME || !process.env.BASIC_AUTH_PASSWORD) {
        return true; // if there's no basic auth configured, we're authenticated
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return false;
    }

    const [username, password] = atob(authHeader.split(' ')[1]).split(':');
    return username === process.env.BASIC_AUTH_USERNAME && password === process.env.BASIC_AUTH_PASSWORD;
}

/**
 * Special handler for opencouncil.chania.gr
 * - Redirects /chania/* paths to /* to clean up URLs
 * - Redirects paths to the main domain unless they are specific Chania content
 * - Rewrites Chania-specific paths to their equivalent on the main site /{locale}/chania/*
 */
function handleChaniaSubdomain(req: NextRequest) {
    const hostname = req.headers.get('host');

    // Only handle the specific case of opencouncil.chania.gr
    if (hostname !== 'opencouncil.chania.gr') {
        return null;
    }

    const url = req.nextUrl.clone();
    const defaultLocale = routing.defaultLocale;
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr';

    // Extract locale from path if present
    let locale = defaultLocale;
    let path = url.pathname;

    if (path.startsWith('/en')) {
        locale = 'en';
        path = path.substring(3); // Remove locale prefix
    } else if (path.startsWith('/el')) {
        locale = 'el';
        path = path.substring(3); // Remove locale prefix
    }

    // If the path starts with /chania, redirect to remove it from the URL
    if (path.startsWith('/chania')) {
        const cleanPath = path.substring(7); // Remove /chania prefix
        const redirectUrl = new URL(req.url);
        redirectUrl.pathname = cleanPath || '/';

        // Preserve the locale if it was in the original URL
        if (locale !== defaultLocale) {
            redirectUrl.pathname = `/${locale}${redirectUrl.pathname}`;
        }

        return NextResponse.redirect(redirectUrl, 301);
    }

    // List of paths that should remain on the Chania subdomain (Chania-specific content)
    const chaniaSpecificPaths = [
        '/',                  // Root path
        '/council',           // Council page
        '/events',            // Events
        '/documents',         // Documents
        '/services',          // Services
        '/decisions',         // Decisions
        '/news',              // News
        '/announcements',     // Announcements
    ];

    // Check if this is a Chania-specific path
    const isChaniaDomain = chaniaSpecificPaths.some(chaniaPath =>
        path === chaniaPath || path.startsWith(`${chaniaPath}/`)
    );

    // If not a Chania-specific path, redirect to the main domain
    if (!isChaniaDomain) {
        // Redirect to the main domain with the same path
        const mainSiteUrl = new URL(req.url);
        mainSiteUrl.host = mainDomain;

        // Preserve locale in the URL if not default
        if (locale !== defaultLocale) {
            mainSiteUrl.pathname = `/${locale}${path}`;
        } else {
            mainSiteUrl.pathname = path;
        }

        return NextResponse.redirect(mainSiteUrl, 302); // Temporary redirect for non-Chania content
    }

    // For Chania-specific paths, rewrite to the main site's chania content
    const rewriteUrl = new URL(req.url);
    rewriteUrl.pathname = `/${locale}/chania${path}`;
    return NextResponse.rewrite(rewriteUrl);
}