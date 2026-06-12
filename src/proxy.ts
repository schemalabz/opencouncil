import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from './auth'
import { env } from '@/env.mjs';

const i18nMiddleware = createIntlMiddleware(routing);

// Obvious bot-scanner paths. 404 them here, before any rendering, so they
// can't create cache entries or trigger data fetches (#358). Only
// extensionless probes are listed: dotted paths (.php/.env) never reach the
// proxy — the matcher below excludes them — and 404 via locale validation
// without touching per-city caches.
const JUNK_PATH = /^\/(wp-admin|wp-login|wp-content|wp-includes|wordpress|xmlrpc|administrator|phpmyadmin|cgi-bin)(\/|$)/i;

export default async function proxy(req: NextRequest) {
    // Basic auth check
    if (!isHttpBasicAuthAuthenticated(req)) {
        return new NextResponse('Authentication required', {
            status: 401,
            headers: { 'WWW-Authenticate': 'Basic' },
        });
    }

    if (JUNK_PATH.test(req.nextUrl.pathname)) {
        return new NextResponse(null, { status: 404 });
    }

    // Handle the specific case for opencouncil.chania.gr
    const chaniaResponse = handleChaniaSubdomain(req);
    if (chaniaResponse) return chaniaResponse;

    // Next's automatic trailing-slash redirect is disabled app-wide
    // (skipTrailingSlashRedirect in next.config.mjs) because PostHog calls
    // its /ingest endpoints with trailing slashes. /ingest itself never
    // reaches the proxy — the matcher excludes it — so restore the
    // canonical-URL redirect for everything else here.
    // Note: a plain URL, not req.nextUrl.clone() — NextURL keeps the trailing
    // slash as a separate flag and re-appends it when serializing, which
    // would redirect the URL to itself.
    if (req.nextUrl.pathname.length > 1 && req.nextUrl.pathname.endsWith('/')) {
        const target = new URL(
            req.nextUrl.pathname.replace(/\/+$/, '') + req.nextUrl.search,
            req.url,
        );
        return NextResponse.redirect(target, 308);
    }

    // Legacy vanity URL: rewrite /t-shirt to /qr/t-shirt
    // This allows managing the redirect destination from the QR campaign admin
    const pathname = req.nextUrl.pathname;
    if (pathname === '/t-shirt') {
        const url = req.nextUrl.clone();
        url.pathname = '/qr/t-shirt';
        return NextResponse.rewrite(url);
    }

    // Handle i18n first (skip for /qr/* paths to allow direct route handler)
    if (/^\/(?!api|_next|_vercel|qr\/|\..+).*/.test(pathname)) {
        const response = await i18nMiddleware(req);
        if (response) return response;
    }

    return auth(req as any);
}

export const config = {
    // `ingest` is the PostHog reverse proxy (rewrites in next.config.mjs):
    // its extensionless endpoints (/ingest/e/, /ingest/flags/) must bypass
    // basic auth and i18n routing, or events get swallowed by locale 404s.
    matcher: ['/((?!api|ingest|_next|_vercel|.*\\..*).*)'],
};

function isHttpBasicAuthAuthenticated(req: Request) {
    if (!env.BASIC_AUTH_USERNAME || !env.BASIC_AUTH_PASSWORD) {
        return true; // if there's no basic auth configured, we're authenticated
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return false;
    }

    // Must be a well-formed `Basic <base64>` header. Anything else (missing
    // payload, wrong scheme, invalid base64) is unauthenticated, not a 500.
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme !== 'Basic' || !encoded) {
        return false;
    }

    let decoded: string;
    try {
        decoded = atob(encoded);
    } catch {
        return false;
    }

    // Per RFC 7617 the credentials are `username:password`; only the username
    // is colon-free, so split on the first colon to preserve colons in passwords.
    const sep = decoded.indexOf(':');
    if (sep === -1) {
        return false;
    }
    const username = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);
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
    const path = url.pathname;

    // Create URL for the main domain
    const mainSiteUrl = new URL(env.NEXTAUTH_URL);

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