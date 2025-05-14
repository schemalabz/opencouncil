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
 * Handles opencouncil.chania.gr as an alias for opencouncil.gr/chania
 * 
 * Rules:
 * 1. If URL has /chania in it, remove the redundant prefix
 * 2. For paths that are definitely NOT Chania-specific, redirect to main site
 * 3. For all other paths, rewrite to load Chania-specific content
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

    // Rule 1: Check if the URL contains /chania
    if (path.includes('/chania')) {
        // Remove the /chania segment from the path
        const newPath = path.replace('/chania', '');

        // Make sure we don't end up with an empty path
        const finalPath = newPath || '/';

        // Create the redirect URL with locale if needed
        const redirectUrl = new URL(req.url);
        redirectUrl.pathname = locale !== defaultLocale ?
            `/${locale}${finalPath}` : finalPath;

        // Redirect to the clean URL
        return NextResponse.redirect(redirectUrl, 301);
    }

    // Rule 2: Check if this is a global path that should go to main site
    // These are paths that definitely are not Chania-specific

    // Get the first path segment after removing leading slash
    const pathWithoutLeadingSlash = path.startsWith('/') ? path.substring(1) : path;
    const firstSegment = pathWithoutLeadingSlash.split('/')[0];

    // These are definitely global site features, not Chania-specific
    const definitelyGlobalFeatures = [
        'search', 'about', 'contact', 'municipalities', 'regions',
        'login', 'register', 'settings', 'privacy', 'terms', 'help',
        'faq', 'api', '_next', 'favicon.ico'
    ];

    if (definitelyGlobalFeatures.includes(firstSegment)) {
        // Redirect to main domain for global paths
        const mainSiteUrl = new URL(`https://${mainDomain}`);

        // Set the path with locale if needed
        mainSiteUrl.pathname = locale !== defaultLocale ?
            `/${locale}${path}` : path;

        // Preserve search params
        mainSiteUrl.search = url.search;

        return NextResponse.redirect(mainSiteUrl, 302);
    }

    // Rule 3: For all other paths (including root and Chania-specific),
    // rewrite to show Chania content
    url.pathname = `/${locale}/chania${path}`;

    // Use the same URL object to avoid connection issues
    return NextResponse.rewrite(url);
}