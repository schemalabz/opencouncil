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

    // Handle subdomain routing (e.g., chania.opencouncil.gr -> opencouncil.gr/chania)
    const subdomainResponse = handleSubdomainRouting(req);
    if (subdomainResponse) return subdomainResponse;

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
 * Handles subdomain routing to city pages
 * Maps city.opencouncil.gr to opencouncil.gr/[locale]/[cityId]
 */
function handleSubdomainRouting(req: NextRequest) {
    // Check if subdomain routing is enabled
    const enableSubdomains = process.env.NEXT_PUBLIC_ENABLE_SUBDOMAINS === 'true';
    if (!enableSubdomains) {
        return null;
    }

    const url = req.nextUrl.clone();
    const hostname = req.headers.get('host');
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'opencouncil.gr';

    // Skip if not a subdomain or if already on the main domain
    if (!hostname || hostname === mainDomain || hostname === `www.${mainDomain}`) {
        return null;
    }

    // Check if this is a subdomain of our main domain
    if (!hostname.endsWith(`.${mainDomain}`)) {
        return null;
    }

    // Extract subdomain (e.g., "chania" from "chania.opencouncil.gr")
    const subdomain = hostname.split('.')[0];

    // Only process known city subdomains
    if (!subdomain || subdomain === 'www') {
        return null;
    }

    // Don't rewrite if already accessing a proper city route
    // This prevents infinite redirects
    if (url.pathname.match(new RegExp(`^\\/(en|el)\\/${subdomain}(\\/|$)`))) {
        return null;
    }

    // Get default locale from routing config
    const defaultLocale = routing.defaultLocale;

    // Detect locale from existing path
    let locale = defaultLocale;
    let path = url.pathname;

    // Handle locale in the path
    if (path.startsWith('/en')) {
        locale = 'en';
        path = path.substring(3); // Remove the locale prefix
    } else if (path.startsWith('/el')) {
        locale = 'el';
        path = path.substring(3); // Remove the locale prefix
    }

    // Construct the new URL with the city ID
    url.pathname = `/${locale}/${subdomain}${path || ''}`;

    // Use rewrite to keep the original URL visible to the user
    return NextResponse.rewrite(url);
}