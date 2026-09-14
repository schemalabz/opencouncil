/**
 * Runs public/sw.js in a sandbox with a fake Cache Storage, so the caching
 * rules are checked without a browser.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { DEFAULT_LOCALE, LOCALES, urlPrefixForLocale } from '@/i18n/config';

const ORIGIN = 'https://opencouncil.gr';
const source = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

type Listener = (event: Record<string, unknown>) => void;
type FetchStub = (input: string | { url: string }) => Promise<Response>;

const keyOf = (input: string | { url: string }) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href;

function loadWorker(fetchStub: FetchStub, existingCaches: string[] = []) {
    const listeners: Record<string, Listener> = {};
    const stores = new Map<string, Map<string, Response>>(existingCaches.map((name) => [name, new Map()]));
    const caches = {
        open: async (name: string) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name)!;
            return {
                match: async (input: string | { url: string }) => store.get(keyOf(input)),
                put: async (input: string | { url: string }, response: Response) => { store.set(keyOf(input), response); },
                add: async (input: string | { url: string }) => { store.set(keyOf(input), await fetchStub(input)); },
                keys: async () => [...store.keys()].map((url) => ({ url })),
                delete: async (input: string | { url: string }) => store.delete(keyOf(input)),
            };
        },
        keys: async () => [...stores.keys()],
        delete: async (name: string) => stores.delete(name),
    };
    const self = {
        addEventListener: (type: string, listener: Listener) => { listeners[type] = listener; },
        location: { origin: ORIGIN },
        skipWaiting: jest.fn(async () => undefined),
        clients: { claim: jest.fn(async () => undefined) },
    };
    vm.runInNewContext(source, { self, caches, fetch: fetchStub, Response, URL, Promise, console });
    return { listeners, stores, self };
}

const offlineHtml = (locale: string) =>
    `<html><head><link rel="stylesheet" href="/_next/static/css/app.css"><script src="/_next/static/chunks/main.js"></script></head><body>offline ${locale}</body></html>`;

const serveOffline: FetchStub = async (input) => {
    const { pathname } = new URL(keyOf(input));
    if (pathname.endsWith('/offline')) return new Response(offlineHtml(pathname));
    if (pathname.startsWith('/_next/static/')) return new Response(`asset ${pathname}`);
    return new Response('page');
};

async function install(listeners: Record<string, Listener>) {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.install({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
}

async function dispatchFetch(listeners: Record<string, Listener>, request: { url: string; method?: string; mode?: string }) {
    let responded: Promise<Response> | undefined;
    listeners.fetch({
        request: { method: 'GET', mode: 'no-cors', ...request },
        respondWith: (promise: Promise<Response>) => { responded = promise; },
        waitUntil: () => undefined,
    });
    return responded ? await responded : undefined;
}

const nonDefaultPrefixes = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(urlPrefixForLocale);

describe('public/sw.js', () => {
    it('lists every non-default locale prefix', () => {
        const match = source.match(/const LOCALE_PREFIXES = \[([^\]]*)\]/);
        const listed = match![1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, ''));
        expect(listed.sort()).toEqual([...nonDefaultPrefixes].sort());
    });

    it('caches every locale offline page and its build assets at install', async () => {
        const { listeners, stores, self } = loadWorker(serveOffline);
        await install(listeners);

        const pages = stores.get('oc-pages-v1')!;
        expect([...pages.keys()].sort()).toEqual(
            ['/offline', ...nonDefaultPrefixes.map((prefix) => `/${prefix}/offline`)].map((p) => `${ORIGIN}${p}`).sort(),
        );
        const statics = stores.get('oc-static-v1')!;
        expect(statics.has(`${ORIGIN}/_next/static/css/app.css`)).toBe(true);
        expect(statics.has(`${ORIGIN}/_next/static/chunks/main.js`)).toBe(true);
        expect(self.skipWaiting).toHaveBeenCalled();
    });

    it('still installs when the offline page cannot be fetched', async () => {
        const { listeners, self } = loadWorker(async () => { throw new TypeError('offline'); });
        await install(listeners);
        expect(self.skipWaiting).toHaveBeenCalled();
    });

    it('passes a navigation through when the network answers', async () => {
        const { listeners } = loadWorker(serveOffline);
        await install(listeners);
        const response = await dispatchFetch(listeners, { url: `${ORIGIN}/en/athens`, mode: 'navigate' });
        expect(await response!.text()).toBe('page');
    });

    it('serves the offline page of the request locale when a navigation fails', async () => {
        const { listeners } = loadWorker(serveOffline);
        await install(listeners);
        let online = false;
        const { listeners: offlineListeners } = loadWorker(async (input) => {
            if (!online) throw new TypeError('offline');
            return serveOffline(input);
        });
        // Install with the network, then fail every fetch.
        online = true;
        await install(offlineListeners);
        online = false;

        const en = await dispatchFetch(offlineListeners, { url: `${ORIGIN}/en/athens/m1`, mode: 'navigate' });
        expect(await en!.text()).toContain('offline /en/offline');
        const el = await dispatchFetch(offlineListeners, { url: `${ORIGIN}/athens/m1`, mode: 'navigate' });
        expect(await el!.text()).toContain('offline /offline');
    });

    it('answers with a fallback when no offline page was cached', async () => {
        const { listeners } = loadWorker(async () => { throw new TypeError('offline'); });
        await install(listeners);
        const response = await dispatchFetch(listeners, { url: `${ORIGIN}/athens`, mode: 'navigate' });
        expect(response!.status).toBe(503);
        expect(await response!.text()).toContain('OpenCouncil');
    });

    it('serves build assets from the cache after the first fetch', async () => {
        let calls = 0;
        const { listeners } = loadWorker(async (input) => {
            calls += 1;
            return new Response(`asset ${calls}`, { headers: { 'x-url': keyOf(input) } });
        });
        const url = `${ORIGIN}/_next/static/chunks/page.js`;
        expect(await (await dispatchFetch(listeners, { url }))!.text()).toBe('asset 1');
        expect(await (await dispatchFetch(listeners, { url }))!.text()).toBe('asset 1');
        expect(calls).toBe(1);
    });

    it('does not intercept API, POST or cross-origin requests', async () => {
        const { listeners } = loadWorker(serveOffline);
        expect(await dispatchFetch(listeners, { url: `${ORIGIN}/api/cities` })).toBeUndefined();
        expect(await dispatchFetch(listeners, { url: `${ORIGIN}/athens`, method: 'POST', mode: 'navigate' })).toBeUndefined();
        expect(await dispatchFetch(listeners, { url: 'https://data.opencouncil.gr/image.png' })).toBeUndefined();
        expect(await dispatchFetch(listeners, { url: `${ORIGIN}/ingest/e` })).toBeUndefined();
    });

    it('drops caches of an older worker version at activate', async () => {
        const { listeners, stores } = loadWorker(serveOffline, ['oc-pages-v0', 'oc-static-v0', 'unrelated']);
        let pending: Promise<unknown> = Promise.resolve();
        listeners.activate({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
        await pending;
        expect([...stores.keys()]).toEqual(['unrelated']);
    });
});
