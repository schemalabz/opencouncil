// The OpenCouncil service worker. Registered by
// src/components/pwa/ServiceWorkerRegistration.tsx on production builds.
//
// What it does:
// - Caches hashed build assets (/_next/static/*) cache-first. Their URL
//   changes with their content, so a cached copy is never stale.
// - Caches public images and fonts stale-while-revalidate.
// - Serves the offline page when a navigation fails without a network.
//
// What it never does: cache an HTML page. Pages vary by signed-in user (see
// the `private, no-store` rule in next.config.mjs), and a cached page would
// hand one visitor's page to the next. The offline pages are the exception;
// they render no per-user data.
//
// Bump VERSION when the caching rules change; activate() drops every cache
// from an older version.
const VERSION = 1;
const PAGE_CACHE = `oc-pages-v${VERSION}`;
const STATIC_CACHE = `oc-static-v${VERSION}`;
const ASSET_CACHE = `oc-assets-v${VERSION}`;
const CURRENT_CACHES = [PAGE_CACHE, STATIC_CACHE, ASSET_CACHE];

// Upper bounds on cache entries; the oldest entries go first.
const STATIC_LIMIT = 300;
const ASSET_LIMIT = 80;

// URL prefixes of the non-default locales (src/i18n/config.ts). The default
// locale has no prefix. A test guards this list against drift.
const LOCALE_PREFIXES = ['en', 'fr', 'sr', 'lat'];
const OFFLINE_PATH = '/offline';
const OFFLINE_PATHS = [OFFLINE_PATH, ...LOCALE_PREFIXES.map((prefix) => `/${prefix}${OFFLINE_PATH}`)];

// Embeds load inside third-party iframes and get no offline page: an iframe
// showing "you are offline" over a host site's own content helps nobody.
// Same shape as EMBED_PATH in src/lib/utils/embed.ts.
const EMBED_PATH = new RegExp(`^/(?:(?:${LOCALE_PREFIXES.join('|')})/)?embed(?:/|$)`);

// The Serbian script choice (src/lib/seo-redirects.ts): the proxy sends a
// reader with this cookie to the /lat tree, so the unprefixed start URL of
// an installed app means Latin for them. Read through the Cookie Store API
// where the worker has it; elsewhere Cyrillic, the default, stands. The
// choice only counts on the serbia realm: its production domain, or a
// preview host whose realm override cookie (src/lib/realm.ts) names it.
const SERBIAN_SCRIPT_COOKIE = 'oc-script';
const REALM_OVERRIDE_COOKIE = 'oc-realm';
const SERBIA_DOMAIN = 'opencouncil.rs';
const LATIN_PREFIX = 'lat';

const ASSET_PATH = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

// Shown only when the offline page itself was never cached.
const FALLBACK_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OpenCouncil</title><p style="font-family:system-ui,sans-serif;padding:2rem;text-align:center">OpenCouncil is offline.</p>';

self.addEventListener('install', (event) => {
    event.waitUntil(precacheOfflinePages().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(deleteStaleCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        if (!EMBED_PATH.test(url.pathname)) event.respondWith(navigateOrOffline(request));
        return;
    }
    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(cacheFirst(STATIC_CACHE, request, STATIC_LIMIT));
        return;
    }
    if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ingest/')) {
        return;
    }
    if (ASSET_PATH.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(event, ASSET_CACHE, request, ASSET_LIMIT));
    }
});

/** The offline page for a locale-prefixed path, or the default-locale one. */
async function offlinePathFor(pathname) {
    const match = pathname.match(/^\/([^/]+)(?:\/|$)/);
    if (match && LOCALE_PREFIXES.includes(match[1])) return `/${match[1]}${OFFLINE_PATH}`;
    if (await prefersLatinScript()) return `/${LATIN_PREFIX}${OFFLINE_PATH}`;
    return OFFLINE_PATH;
}

async function prefersLatinScript() {
    if (!self.cookieStore) return false;
    try {
        const script = await self.cookieStore.get(SERBIAN_SCRIPT_COOKIE);
        if (script?.value !== 'latn') return false;
        const host = self.location.hostname;
        if (host === SERBIA_DOMAIN || host.endsWith(`.${SERBIA_DOMAIN}`)) return true;
        const realm = await self.cookieStore.get(REALM_OVERRIDE_COOKIE);
        return realm?.value === 'serbia';
    } catch {
        return false;
    }
}

async function navigateOrOffline(request) {
    try {
        return await fetch(request);
    } catch {
        const cache = await caches.open(PAGE_CACHE);
        const url = new URL(request.url);
        return (await cache.match(await offlinePathFor(url.pathname)))
            || (await cache.match(OFFLINE_PATH))
            || new Response(FALLBACK_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}

async function cacheFirst(cacheName, request, limit) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        await cache.put(request, response.clone());
        await trim(cache, limit);
    }
    return response;
}

async function staleWhileRevalidate(event, cacheName, request, limit) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const refresh = fetch(request).then(async (response) => {
        if (response.ok) {
            await cache.put(request, response.clone());
            await trim(cache, limit);
        }
        return response;
    });
    if (cached) {
        // Keep the worker alive until the refresh lands, and swallow a failed
        // refresh: the cached copy already answered.
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
    }
    return refresh;
}

async function trim(cache, limit) {
    const keys = await cache.keys();
    if (keys.length <= limit) return;
    await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

/**
 * Fetches every locale's offline page and the build assets it references, so
 * the page renders with its styles when there is no network. A page that
 * fails to fetch is skipped: the worker is still worth installing for the
 * asset caches, and the next deploy retries.
 */
async function precacheOfflinePages() {
    const pages = await caches.open(PAGE_CACHE);
    const statics = await caches.open(STATIC_CACHE);
    await Promise.all(OFFLINE_PATHS.map(async (path) => {
        try {
            const response = await fetch(path, { cache: 'reload' });
            if (!response.ok) return;
            const html = await response.text();
            // A locale the realm does not serve redirects to the unprefixed
            // page. A redirected response must not be stored as is: the
            // browser refuses to show one for a navigation. Store a fresh one.
            await pages.put(path, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
            const assets = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
            await Promise.all(assets.map(async (asset) => {
                if (await statics.match(asset)) return;
                try {
                    await statics.add(asset);
                } catch {
                    // A missing chunk degrades the offline page; it does not block install.
                }
            }));
        } catch {
            // No network at install time, or the page errored.
        }
    }));
}

async function deleteStaleCaches() {
    const names = await caches.keys();
    await Promise.all(names
        .filter((name) => name.startsWith('oc-') && !CURRENT_CACHES.includes(name))
        .map((name) => caches.delete(name)));
}
