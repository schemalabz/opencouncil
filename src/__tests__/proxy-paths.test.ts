jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

jest.mock('@/lib/db/cityRealm', () => ({
    isCityOfRealm: jest.fn(async (cityId: string, realm: string) =>
        (realm === 'greece' ? ['athens', 'chania'] : ['lyon']).includes(cityId)),
}));

import { NextRequest } from 'next/server';
import proxy, { config } from '@/proxy';
import { auth } from '@/auth';
import { isCityOfRealm } from '@/lib/db/cityRealm';

const get = (path: string, host = 'opencouncil.gr') =>
    proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));

/** True when the proxy hands the request to Next with no rewrite and no redirect. */
const continues = (res: Response | undefined) =>
    res === undefined || (res.status === 200 && res.headers.get('location') === null);

beforeEach(() => {
    jest.mocked(auth).mockClear();
    jest.mocked(isCityOfRealm).mockClear();
});

/**
 * A path that is not a page of the app gets a 404 from the proxy. Next
 * renders nested segments in parallel, so a 404 from a layout arrives after
 * the pages below it have run their queries.
 */
describe('proxy on a path with a dot', () => {
    it.each(['/.env', '/config/initializers/stripe.rb', '/athens/terraform.tfvars', '/en/.env', '/about/.env'])(
        'answers 404 for %s and does no other work',
        async (path) => {
            const res = await get(path);

            expect(res!.status).toBe(404);
            expect(auth).not.toHaveBeenCalled();
            expect(isCityOfRealm).not.toHaveBeenCalled();
        },
    );

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
    it.each(['/etc/environment', '/actuator/heapdump', '/HEAD', '/%2eenv', '/en/etc/environment', '/wp-admin/setup-config', '/en/wp-login', '/api', '/api-catalog', '/_next/unknown', '/_vercel/insights'])(
        'answers 404 for %s',
        async (path) => {
            const res = await get(path);

            expect(res!.status).toBe(404);
            // A reader with a wrong address gets a link to the home page.
            expect(await res!.text()).toContain('<a href="/">');
        },
    );

    it.each(['/HEAD', '/%2eenv', '/_profiler/phpinfo'])('does not read the cities for %s', async (path) => {
        await get(path);

        expect(isCityOfRealm).not.toHaveBeenCalled();
    });

    it('answers 404 for a city of another realm', async () => {
        expect((await get('/lyon'))!.status).toBe(404);
        expect(continues(await get('/lyon', 'opencouncil.fr'))).toBe(true);
    });

    it.each(['/athens', '/athens/jun26_2026', '/en/chania', '/', '/en', '/about', '/search', '/en/sign-in'])(
        'does not answer 404 for %s',
        async (path) => {
            expect((await get(path))?.status ?? 200).not.toBe(404);
        },
    );

    it.each(['/about', '/', '/en/search'])('does not read the cities for %s', async (path) => {
        await get(path);

        expect(isCityOfRealm).not.toHaveBeenCalled();
    });
});

/**
 * The matcher skips only the trees that Next serves with no page below them.
 * A wider prefix lets a path such as `/api-catalog` skip the proxy and match
 * `[locale]`.
 */
describe('proxy matcher', () => {
    const matches = (path: string) => config.matcher.some(source => new RegExp(`^${source}$`).test(path));

    it.each(['/api/health', '/api/unknown', '/ingest/e/', '/_next/static/chunks/a.js', '/_next/image'])(
        'skips %s',
        (path) => {
            expect(matches(path)).toBe(false);
        },
    );

    it.each(['/', '/athens', '/.env', '/favicon.ico', '/api', '/api-catalog', '/ingest', '/_next/unknown', '/_vercel/insights'])(
        'sends %s to the proxy',
        (path) => {
            expect(matches(path)).toBe(true);
        },
    );
});
