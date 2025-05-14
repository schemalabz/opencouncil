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
 * 2. Otherwise, rewrite internally to /chania/* to show Chania content
 * 
 * Also handles navigation between pages:
 * - Links within Chania content stay on the subdomain
 * - Links to content outside of Chania go to the main site
 */
function handleChaniaSubdomain(req: NextRequest) {
    const hostname = req.headers.get('host');

    // Only handle the specific case of opencouncil.chania.gr
    if (hostname !== 'opencouncil.chania.gr') {
        return null;
    }

    const url = req.nextUrl.clone();
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr';

    // Get the path from the URL
    const { pathname, search } = url;

    // Check if the URL contains /chania
    if (pathname.includes('/chania')) {
        // Remove the /chania segment from the path
        const newPath = pathname.replace('/chania', '');

        // Make sure we don't end up with an empty path
        const finalPath = newPath || '/';

        // Create the redirect URL
        const redirectUrl = new URL(`${finalPath}${search}`, req.url);

        // Redirect to the clean URL
        return NextResponse.redirect(redirectUrl, 301);
    }

    // Otherwise, handle as a Chania path
    // Rewrite internally to /chania/*

    // Detect if this is an "external" navigation by checking the referer
    const referer = req.headers.get('referer');
    const isExternalNavigation = referer &&
        // Either referer is not from our domain
        (!referer.includes('opencouncil.chania.gr') ||
            // Or explicitly going to a non-Chania section of the main site
            referer.includes('/municipalities') ||
            referer.includes('/regions') ||
            referer.includes('/about') ||
            referer.includes('/contact'));

    // If we're navigating from Chania to a non-Chania section, redirect to main site
    if (isExternalNavigation) {
        const mainSiteUrl = new URL(req.url);
        mainSiteUrl.host = mainDomain;
        return NextResponse.redirect(mainSiteUrl, 302);
    }

    // Otherwise, rewrite to the appropriate Chania content
    const rewriteUrl = new URL(`/chania${pathname}${search}`, `https://${mainDomain}`);
    return NextResponse.rewrite(rewriteUrl);
}