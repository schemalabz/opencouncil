import createIntlMiddleware from 'next-intl/middleware';
import { routing, LOCALE_OVERRIDE_HEADER } from './i18n/routing';
import { NextResponse, NextRequest } from 'next/server';
import { auth } from './auth'
import { env } from '@/env.mjs';
import { REALMS, REALM_OVERRIDE_COOKIE, isRealm, isRealmApexHost, realmForHost, realmOverride } from './lib/realm';
import { LOCALE_PREFIX_RE, SERBIAN_SCRIPT_COOKIE, foreignLocaleRedirectPath, serbianScriptAdoption, serbianScriptParamTarget, serbianScriptRedirectPath, wwwRedirectTarget } from './lib/seo-redirects';
import { isSerbianScript } from './lib/serbian/transliterate';
import { mcpRewriteTarget } from './lib/mcp/rewrite';

const i18nMiddleware = createIntlMiddleware(routing);

// Obvious bot-scanner paths. 404 them here, before any rendering, so they
// can't create cache entries or trigger data fetches (#358). Only
// extensionless probes are listed: dotted paths (.php/.env) never reach the
// proxy — the matcher below excludes them — and 404 via locale validation
// without touching per-city caches.
const JUNK_PATH = /^\/(wp-admin|wp-login|wp-content|wp-includes|wordpress|xmlrpc|administrator|phpmyadmin|cgi-bin)(\/|$)/i;

// Page paths that go through i18n routing (i.e. not api/_next/_vercel/qr or
// dotted asset paths). Both the realm-locale rewrite and the i18n handoff
// gate on this.
const APP_PATH = /^\/(?!api|_next|_vercel|qr\/|\..+).*/;


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

    // www hosts duplicate the apex domain in Google's index — 301 them away.
    const wwwTarget = wwwRedirectTarget(
        req.headers.get('host'),
        req.nextUrl.pathname,
        req.nextUrl.search,
    );
    if (wwwTarget) {
        return NextResponse.redirect(wwwTarget, 301);
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

    // MCP protocol requests share the memorable /mcp URL with the human
    // instructions page: JSON-RPC traffic (and tokened /mcp/{token} URLs) is
    // rewritten to the API handler, browser GETs fall through to i18n and
    // render the page.
    const mcpTarget = mcpRewriteTarget(pathname, req.method, req.headers.get('accept'), req.headers.get('content-type'));
    if (mcpTarget) {
        const url = req.nextUrl.clone();
        url.pathname = mcpTarget;
        return NextResponse.rewrite(url);
    }

    // Realm override for non-production hosts: `?realm=serbia` persists the
    // realm in a cookie and redirects to the clean URL; from then on the
    // request is treated as that realm end-to-end (this proxy, `getRealm()`,
    // client components). Previews are subdomains of opencouncil.gr and some
    // realm domains have no DNS yet, so this is the only way to review other
    // realms there. Ignored on production apex hosts — see `isRealmApexHost`.
    const host = req.headers.get('host');
    const realmParam = req.nextUrl.searchParams.get('realm');
    if (realmParam !== null && isRealm(realmParam) && !isRealmApexHost(host)) {
        const cleanUrl = req.nextUrl.clone();
        cleanUrl.searchParams.delete('realm');
        const response = NextResponse.redirect(cleanUrl, 302);
        response.cookies.set(REALM_OVERRIDE_COOKIE, realmParam, {
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
            sameSite: 'lax',
        });
        return response;
    }
    const override = realmOverride(host, req.cookies.get(REALM_OVERRIDE_COOKIE)?.value);
    const realm = override ?? realmForHost(host);

    // A foreign locale prefix on a realm host (/fr on .gr, /el on .fr) is an
    // orphaned duplicate tree — 301 it to the unprefixed URL. Must run before
    // the .fr rewrite and the i18n middleware below.
    const strippedPath = foreignLocaleRedirectPath(host, pathname, override);
    if (strippedPath !== null) {
        return NextResponse.redirect(new URL(strippedPath + req.nextUrl.search, req.url), 301);
    }

    // Script persistence for the digraphic Serbian realm: a reader who chose
    // Latin (Ћир | Lat switcher → 'latn' cookie) stays in the /lat tree even
    // when a link, bookmark or share points at an unprefixed URL.
    //
    // The switcher's Ћир link carries `?script=cyrl` (mirroring `?realm=`):
    // the choice must live in the URL, not in an onClick cookie write,
    // because middle-click / open-in-new-tab never runs the click handler —
    // and a bare unprefixed GET with a stale 'latn' cookie would bounce
    // straight back to /lat, making Cyrillic unreachable. Consuming the
    // param here persists the cookie for every click type. Not gated on
    // method or path: the param only ever arrives on a switcher <a href> GET
    // and is stripped on first sight, so it never survives into a POST.
    const scriptParam = req.nextUrl.searchParams.get('script');
    if (realm === 'serbia' && isSerbianScript(scriptParam)) {
        const cleanUrl = req.nextUrl.clone();
        cleanUrl.searchParams.delete('script');
        // Land on the tree that agrees with the requested script (one hop) —
        // see serbianScriptParamTarget for the /lat/…?script=cyrl case.
        cleanUrl.pathname = serbianScriptParamTarget(pathname, scriptParam);
        const response = NextResponse.redirect(cleanUrl, 302);
        response.cookies.set(SERBIAN_SCRIPT_COOKIE, scriptParam, {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax',
        });
        return response;
    }
    // Page navigations only: GET/HEAD (a 302 on a server-action POST would
    // re-issue it as a bodyless GET; HEAD must agree with GET on the same
    // URL) and app paths (never /api, /qr, static assets).
    const scriptCookie = req.cookies.get(SERBIAN_SCRIPT_COOKIE)?.value;
    if ((req.method === 'GET' || req.method === 'HEAD') && APP_PATH.test(pathname)) {
        const scriptRedirect = serbianScriptRedirectPath(realm, pathname, scriptCookie);
        if (scriptRedirect !== null) {
            return NextResponse.redirect(new URL(scriptRedirect + req.nextUrl.search, req.url), 302);
        }
    }

    // Realm-locale handling: on a host whose realm default differs from the
    // app default (.fr → fr, .rs → sr), serve that locale's UI transparently.
    // Rewrite (not redirect) unprefixed app paths to the locale segment so the
    // [locale] route resolves correctly while the browser's address bar stays
    // on the realm domain. The [locale] layout calls setRequestLocale, so
    // messages load without next-intl's middleware running for these requests.
    // Only applies when the path has no explicit locale prefix, so an explicit
    // /en (or /lat on .rs) is still respected. Unknown hosts (localhost)
    // resolve to greece, whose default is the app default — dev is unaffected
    // unless a realm override cookie says otherwise.
    const realmDefaultLocale = REALMS[realm].defaultLocale;
    if (
        realmDefaultLocale !== routing.defaultLocale &&
        !LOCALE_PREFIX_RE.test(pathname) &&
        APP_PATH.test(pathname)
    ) {
        const localeUrl = req.nextUrl.clone();
        localeUrl.pathname = pathname === '/' ? `/${realmDefaultLocale}` : `/${realmDefaultLocale}${pathname}`;
        const requestHeaders = new Headers(req.headers);
        // Resolve the rewritten path through next-intl and keep the request
        // headers it sets. We can't just return its response: it leaves an
        // already-correct /sr path alone and emits no rewrite, so the original
        // unprefixed URL would 404. Next encodes request-header overrides as
        // `x-middleware-request-*`, so copying them generically carries the
        // locale across without naming a next-intl internal.
        //
        // Without this the [locale] layout's setRequestLocale is the only
        // locale source on these hosts, and next-intl caches the first result
        // for every implicit caller — so any page resolving translations
        // before the layout serves the whole request in the app default
        // locale (#606).
        const localeRequest = new NextRequest(localeUrl, { headers: req.headers, method: req.method });
        const intlResponse = await i18nMiddleware(localeRequest);
        intlResponse?.headers.forEach((value, key) => {
            const forwarded = /^x-middleware-request-(.+)$/i.exec(key);
            if (forwarded) requestHeaders.set(forwarded[1], value);
        });
        // The root layout sits above the [locale] segment and reads this to set
        // the <html lang> attr.
        requestHeaders.set(LOCALE_OVERRIDE_HEADER, realmDefaultLocale);
        return NextResponse.rewrite(localeUrl, { request: { headers: requestHeaders } });
    }

    // Handle i18n first (skip for /qr/* paths to allow direct route handler)
    if (APP_PATH.test(pathname)) {
        const response = await i18nMiddleware(req);
        if (response) {
            // Entering the /lat tree by any route (external link, share)
            // adopts Latin as the persisted choice — policy and rationale in
            // serbianScriptAdoption (embeds exempt).
            const adopted = serbianScriptAdoption(realm, pathname, scriptCookie);
            if (adopted !== null) {
                response.cookies.set(SERBIAN_SCRIPT_COOKIE, adopted, {
                    path: '/',
                    maxAge: 60 * 60 * 24 * 365,
                    sameSite: 'lax',
                });
            }
            return response;
        }
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