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
 * Makes the subdomain serve as an alias for opencouncil.gr/chania
 * 
 * This handler implements these rules:
 * 1. For /chania/* paths, redirect to /* to remove the redundant prefix
 * 2. For paths that are NOT Chania-specific content, redirect to the main site
 * 3. For Chania-specific content, rewrite to /chania/* on the main site
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

    // Rule 1: Handle redundant /chania prefix
    if (path.startsWith('/chania')) {
        const cleanPath = path.substring(7) || '/'; // Remove /chania prefix, default to / if empty
        const redirectUrl = new URL(req.url);

        // Keep the locale if present
        if (locale !== defaultLocale) {
            redirectUrl.pathname = `/${locale}${cleanPath}`;
        } else {
            redirectUrl.pathname = cleanPath;
        }

        return NextResponse.redirect(redirectUrl, 301);
    }

    // Rule 2: Check if this is a path for the main site rather than Chania-specific
    // We'll determine this by checking if the path has any of the following characteristics:
    // - Has 'chania' in it (already handled by Rule 1)
    // - Is an API route
    // - Is the root path
    // - Has any subdirectory that looks like Chania-specific content

    // Keep Root path on the Chania subdomain
    if (path === '/') {
        // Keep the root path on Chania subdomain
    }
    // Exclude API routes from redirection
    else if (path.startsWith('/api/')) {
        // Keep API routes as is
    }
    // For all other paths that don't appear to be Chania-specific, redirect to main
    else {
        // Redirect to the main domain
        const mainSiteUrl = new URL(req.url);
        mainSiteUrl.host = mainDomain;

        // Preserve locale in the URL
        if (locale !== defaultLocale) {
            mainSiteUrl.pathname = `/${locale}${path}`;
        } else {
            mainSiteUrl.pathname = path;
        }

        return NextResponse.redirect(mainSiteUrl, 302);
    }

    // Rule 3: For Chania-specific content (API routes and root path), rewrite to /chania/
    const rewriteUrl = new URL(req.url);
    rewriteUrl.pathname = `/${locale}/chania${path}`;
    return NextResponse.rewrite(rewriteUrl);
}