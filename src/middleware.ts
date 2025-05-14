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
 * Handles opencouncil.chania.gr by redirecting all requests to opencouncil.gr and handling path appropriately
 */
function handleChaniaSubdomain(req: NextRequest) {
    const hostname = req.headers.get('host');

    // Only handle the specific case of opencouncil.chania.gr
    if (hostname !== 'opencouncil.chania.gr') {
        return null;
    }

    const url = req.nextUrl.clone();
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr';
    const path = url.pathname;

    // Create URL for the main domain
    const mainSiteUrl = new URL(`https://${mainDomain}`);

    // Check if the path already contains /chania and handle appropriately
    if (path.startsWith('/chania/')) {
        // Remove the /chania prefix from the path
        mainSiteUrl.pathname = path.substring('/chania'.length);
    } else if (path === '/chania') {
        // If the path is exactly /chania, redirect to root
        mainSiteUrl.pathname = '/';
    } else {
        // For all other paths, pass them through as-is
        mainSiteUrl.pathname = path;
    }

    // Preserve any query parameters
    mainSiteUrl.search = url.search;

    // Redirect to the main domain
    return NextResponse.redirect(mainSiteUrl, 301);
}