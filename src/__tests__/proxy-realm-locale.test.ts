jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

/**
 * On a realm host whose default locale is not the app default, the proxy
 * rewrites an unprefixed path to the locale segment. The rewrite must carry
 * next-intl's request locale header, or a page that resolves translations
 * before the [locale] layout renders in the app default locale (#606).
 *
 * The proxy copies that header from next-intl's response by Next's
 * `x-middleware-request-*` encoding, which is a Next internal. A Next upgrade
 * that changes the encoding makes the copy a silent no-op, so this test pins
 * the contract.
 */
describe('proxy realm-locale rewrite', () => {
    it.each([
        ['opencouncil.rs', 'sr'],
        ['opencouncil.fr', 'fr'],
        // A realm with no catalog of its own serves the English one.
        ['opencouncil.pl', 'en'],
    ])('rewrites %s to /%s and carries the next-intl locale header', async (host, locale) => {
        const req = new NextRequest(`https://${host}/notifications`, { headers: { host } });

        const res = await proxy(req);

        expect(res).toBeDefined();
        expect(new URL(res!.headers.get('x-middleware-rewrite')!).pathname).toBe(`/${locale}/notifications`);
        expect(res!.headers.get('x-middleware-request-x-next-intl-locale')).toBe(locale);
    });
});

/**
 * A realm whose default is `en` sends every other realm's locale prefix to the
 * unprefixed URL, and keeps `/en` itself. `en` stays shared: the other realms
 * keep serving `/en` too.
 */
describe('proxy on a realm whose default locale is en', () => {
    const get = (host: string, path: string) => proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));

    it.each(['/el', '/fr', '/sr', '/lat'])('301s the foreign prefix %s on opencouncil.pl', async (prefix) => {
        const res = await get('opencouncil.pl', `${prefix}/warszawa?x=1`);

        expect(res!.status).toBe(301);
        const location = new URL(res!.headers.get('location')!);
        expect(location.pathname).toBe('/warszawa');
        expect(location.search).toBe('?x=1');
    });

    it.each([
        ['opencouncil.pl', '/en/warszawa'],
        ['opencouncil.gr', '/en/athens'],
        ['opencouncil.fr', '/en/lyon'],
    ])('does not redirect %s%s', async (host, path) => {
        const res = await get(host, path);

        expect(res?.status ?? 200).not.toBe(301);
        expect(res?.headers.get('location') ?? null).toBeNull();
    });
});
