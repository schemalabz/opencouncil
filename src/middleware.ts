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
 * Maps opencouncil.chania.gr/* to opencouncil.gr/{locale}/chania/*
 */
function handleChaniaSubdomain(req: NextRequest) {
    const hostname = req.headers.get('host');

    // Only handle the specific case of opencouncil.chania.gr
    if (hostname !== 'opencouncil.chania.gr') {
        return null;
    }

    const url = req.nextUrl.clone();
    const defaultLocale = routing.defaultLocale;

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

    // If the path starts with /chania, remove it to prevent duplication
    if (path.startsWith('/chania')) {
        path = path.substring(7); // Remove /chania prefix
    }

    // Rewrite all paths to the main site's chania path
    url.pathname = `/${locale}/chania${path}`;
    return NextResponse.rewrite(url);
}