jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

const CITIES: Record<string, string[]> = { greece: ['athens', 'chania'], france: ['lyon'], serbia: ['nis'] };
jest.mock('@/lib/db/cityRealm', () => ({
    isCityOfRealm: jest.fn(async (cityId: string, realm: string) => CITIES[realm].includes(cityId)),
}));

import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import proxy, { config } from '@/proxy';
import { auth } from '@/auth';
import { isCityOfRealm } from '@/lib/db/cityRealm';

const get = (path: string, host = 'opencouncil.gr', cookie?: string) =>
    proxy(new NextRequest(`https://${host}${path}`, { headers: { host, ...(cookie ? { cookie } : {}) } }));

/** True when the proxy hands the request on to Next: no redirect and no error. A rewrite counts. */
const continues = (res: Response | undefined) =>
    res === undefined || (res.status === 200 && res.headers.get('location') === null);

beforeEach(() => {
    jest.mocked(auth).mockClear();
    jest.mocked(isCityOfRealm).mockClear();
});

/** The fixed 404 page, with its link home. See cityIdCandidate for why the proxy answers. */
async function expectNotFoundPage(res: Response | undefined, home: string) {
    expect(res!.status).toBe(404);
    expect(res!.headers.get('content-type')).toBe('text/html; charset=utf-8');
    // No cache keeps it: a city created later must not stay a 404.
    expect(res!.headers.get('cache-control')).toBe('private, no-store');
    expect(await res!.text()).toContain(`<a href="${home}">`);
}

describe('proxy on a path with a dot', () => {
    it.each([
        ['/.env', '/'],
        ['/.env~', '/'],
        ['/secrets.pkrvars.hcl', '/'],
        ['/app/.env', '/'],
        ['/config/initializers/stripe.rb', '/'],
        ['/athens/terraform.tfvars', '/'],
        ['/about/.env', '/'],
        ['/en/.env', '/en'],
    ])('answers 404 for %s and does no other work', async (path, home) => {
        const res = await get(path);

        await expectNotFoundPage(res, home);
        expect(auth).not.toHaveBeenCalled();
        expect(isCityOfRealm).not.toHaveBeenCalled();
    });

    it.each(['/favicon.ico', '/robots.txt', '/icons/icon-192.png', '/youtu.be/dQw4w9WgXcQ'])(
        'hands %s to Next with no page handling',
        async (path) => {
            const res = await get(path);

            expect(res!.headers.get('x-middleware-next')).toBe('1');
            expect(auth).not.toHaveBeenCalled();
        },
    );
});

describe('proxy on a first segment that is not a page', () => {
    it.each([
        ['/etc/environment', '/'],
        ['/actuator/heapdump', '/'],
        ['/HEAD', '/'],
        ['/%2eenv', '/'],
        ['/wp-admin/setup-config', '/'],
        ['/api-catalog', '/'],
        ['/_next/unknown', '/'],
        ['/_vercel/insights', '/'],
        ['/en/etc/environment', '/en'],
        ['/EN/etc', '/en'],
        ['/en/wp-login', '/en'],
    ])('answers 404 for %s with a link to %s', async (path, home) => {
        await expectNotFoundPage(await get(path), home);
    });

    // A reader of the Latin script gets a link that keeps the script.
    it('links a 404 under /lat to the Latin home page', async () => {
        await expectNotFoundPage(await get('/lat/athina', 'opencouncil.rs'), '/lat');
    });

    it('answers 404 for a city of another realm', async () => {
        expect((await get('/lyon'))!.status).toBe(404);
        expect(continues(await get('/lyon', 'opencouncil.fr'))).toBe(true);
    });

    it('checks the city against the realm of the override cookie on a preview host', async () => {
        expect(continues(await get('/lyon', 'pr-1.opencouncil.dev', 'oc-realm=france'))).toBe(true);
        expect((await get('/athens', 'pr-1.opencouncil.dev', 'oc-realm=france'))!.status).toBe(404);
    });

    it.each(['/athens', '/athens/jun26_2026', '/en/chania', '/', '/en', '/about', '/search', '/en/sign-in', '/EN/athens', '/EN/about', '/LAT/athens', '/%61bout', '/%61thens'])(
        'does not answer 404 for %s',
        async (path) => {
            expect((await get(path))?.status ?? 200).not.toBe(404);
        },
    );

    it.each(['/about', '/', '/en/search', '/%61bout'])('does not read the cities for %s', async (path) => {
        await get(path);

        expect(isCityOfRealm).not.toHaveBeenCalled();
    });

    it('lets the request continue, with a log line, when the city check fails', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.mocked(isCityOfRealm).mockRejectedValueOnce(new Error('database down'));

        expect(continues(await get('/athens'))).toBe(true);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"athens"'), expect.any(Error));
        warn.mockRestore();
    });
});

/**
 * The city check comes after the redirects and the rewrites of fixed paths,
 * and before the rewrite to the locale of the realm.
 */
describe('proxy order around the city check', () => {
    it('rewrites /t-shirt to its QR route and lets /qr/t-shirt through', async () => {
        const rewrite = await get('/t-shirt');
        expect(rewrite!.headers.get('x-middleware-rewrite')).toBe('https://opencouncil.gr/qr/t-shirt');
        expect(continues(await get('/qr/t-shirt'))).toBe(true);
        expect(isCityOfRealm).not.toHaveBeenCalled();
    });

    it('redirects a www host before it checks the city', async () => {
        const res = await get('/etc', 'www.opencouncil.gr');

        expect(res!.status).toBe(301);
        expect(isCityOfRealm).not.toHaveBeenCalled();
    });

    it('stores the realm of ?realm= before it checks the city', async () => {
        const res = await get('/lyon?realm=france', 'pr-1.opencouncil.dev');

        expect(res!.status).toBe(302);
        expect(res!.headers.get('location')).toBe('https://pr-1.opencouncil.dev/lyon');
        expect(isCityOfRealm).not.toHaveBeenCalled();
    });

    it.each(['opencouncil.fr', 'opencouncil.rs'])('answers 404 on %s before the locale rewrite', async (host) => {
        const res = await get('/etc', host);

        expect(res!.status).toBe(404);
        expect(res!.headers.get('x-middleware-rewrite')).toBeNull();
    });
});

/**
 * The matcher skips only the trees that Next serves with no page below them.
 * A wider prefix lets a path such as `/api-catalog` skip the proxy and match
 * `[locale]`.
 */
describe('proxy matcher', () => {
    // Next's own check, which compiles the matcher as Next does: with the
    // optional prefixes and suffixes (`/_next/data/...`, `.rsc`).
    const matches = (path: string) => unstable_doesMiddlewareMatch({ config, url: `https://opencouncil.gr${path}` });

    it.each(['/api', '/api/health', '/api/unknown', '/api/.env', '/ingest/e/', '/_next/static/chunks/a.js', '/_next/image'])(
        'skips %s',
        (path) => {
            expect(matches(path)).toBe(false);
        },
    );

    it.each(['/', '/athens', '/.env', '/favicon.ico', '/api-catalog', '/apis', '/ingest', '/_next/unknown', '/_vercel/insights'])(
        'sends %s to the proxy',
        (path) => {
            expect(matches(path)).toBe(true);
        },
    );
});
