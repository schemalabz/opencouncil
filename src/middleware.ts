import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from './auth'
import { env } from '@/env.mjs';

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

    const pathname = req.nextUrl.pathname;

    // Exclude /map from i18n middleware
    if (pathname === '/map') {
        return auth(req as any);
    }
    
    // Handle i18n for all other relevant paths
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
    if (!env.BASIC_AUTH_USERNAME || !env.BASIC_AUTH_PASSWORD) {
        return true; // if there's no basic auth configured, we're authenticated
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return false;
    }

    const [username, password] = atob(authHeader.split(' ')[1]).split(':');
    return username === env.BASIC_AUTH_USERNAME && password === env.BASIC_AUTH_PASSWORD;
}

/**
 * Handles opencouncil.chania.gr by redirecting all requests to opencouncil.gr/chania
 */
function handleChaniaSubdomain(req: NextRequest) {
    const hostname = req.headers.get('host');

    // Only handle the specific case of opencouncil.chania.gr
    if (hostname !== 'opencouncil.chania.gr') {
        return null;
    }

    const url = req.nextUrl.clone();
    const mainDomain = env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr';
    const path = url.pathname;

    // Create URL for the main domain
    const mainSiteUrl = new URL(`https://${mainDomain}`);

    // Append original path to /chania
    if (path === '/') {
        // Just redirect to /chania if we're at the root
        mainSiteUrl.pathname = '/chania';
    } else {
        // Otherwise add the path after /chania
        mainSiteUrl.pathname = `/chania${path}`;
    }

    // Preserve any query parameters
    mainSiteUrl.search = url.search;

    // Redirect to the main domain with a temporary (302) redirect
    return NextResponse.redirect(mainSiteUrl, 302);
}