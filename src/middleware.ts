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
 * Handles opencouncil.chania.gr by making its paths equivalent to opencouncil.gr/chania/{path}
 */
function handleChaniaSubdomain(req: NextRequest) {
    const hostname = req.headers.get('host');

    // Only handle the specific case of opencouncil.chania.gr
    if (hostname !== 'opencouncil.chania.gr') {
        return null;
    }

    const url = req.nextUrl.clone();
    const path = url.pathname;

    // Special cases to handle paths for the Chania subdomain
    if (path === '/chania') {
        // Redirect to the root of the same subdomain
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = '/';
        return NextResponse.redirect(redirectUrl, 301);
    } else if (path.startsWith('/chania/')) {
        // Remove the /chania prefix but keep on the same subdomain
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = path.substring('/chania'.length);
        return NextResponse.redirect(redirectUrl, 301);
    }

    // For all other paths, rewrite the request to include /chania prefix
    // This makes opencouncil.chania.gr/whatever/foo serve the same content as
    // opencouncil.gr/chania/whatever/foo without changing the URL in the browser
    const rewriteUrl = req.nextUrl.clone();

    // If we're at the root, rewrite to /chania
    if (path === '/') {
        rewriteUrl.pathname = '/chania';
    } else {
        // Otherwise prepend /chania to the path
        rewriteUrl.pathname = `/chania${path}`;
    }

    return NextResponse.rewrite(rewriteUrl);
}