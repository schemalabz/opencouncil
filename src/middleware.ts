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
 * 1. If accessing the subdomain, we want to stay in the Chania realm unless explicitly navigating out
 * 2. All paths on the subdomain should be treated as if they're under /chania on the main domain
 * 3. Links to paths outside the Chania realm should redirect to the main domain
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

    // We'll use "el" as the default locale for Chania as specified
    const locale = "el";

    // Rule 1: Check if the URL already contains /chania (avoid double paths)
    if (path.includes('/chania')) {
        // Remove the redundant /chania segment
        const newPath = path.replace('/chania', '');
        const finalPath = newPath || '/';

        // Create a clean URL without the redundant /chania
        const redirectUrl = new URL(req.url);
        redirectUrl.pathname = finalPath;

        return NextResponse.redirect(redirectUrl, 301);
    }

    // Rule 2: Check for external navigation by examining referer
    const referer = req.headers.get('referer');
    const isExternalNavigation =
        // Only consider it external navigation if:
        // 1. We have a referer (i.e., user clicked a link)
        // 2. The referer is from our subdomain (not direct access)
        // 3. The target path does not include "chania" and looks like a global path
        referer &&
        referer.includes('opencouncil.chania.gr') &&
        !path.toLowerCase().includes('chania') &&
        // Check if this seems like a navigation to a global feature
        (path.startsWith('/cities') || path.startsWith('/about') || path.startsWith('/search'));

    // If it's external navigation, redirect to the main domain
    if (isExternalNavigation) {
        const mainSiteUrl = new URL(`https://${mainDomain}`);
        mainSiteUrl.pathname = `/${locale}${path}`;
        mainSiteUrl.search = url.search;

        return NextResponse.redirect(mainSiteUrl, 302);
    }

    // Default: All other paths on the subdomain are treated as Chania-specific content
    // We rewrite them to show the content from /chania/[path]
    url.pathname = `/${locale}/chania${path}`;

    return NextResponse.rewrite(url);
}