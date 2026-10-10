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
    ])('rewrites %s to /%s and carries the next-intl locale header', async (host, locale) => {
        const req = new NextRequest(`https://${host}/notifications`, { headers: { host } });

        const res = await proxy(req);

        expect(res).toBeDefined();
        expect(new URL(res!.headers.get('x-middleware-rewrite')!).pathname).toBe(`/${locale}/notifications`);
        expect(res!.headers.get('x-middleware-request-x-next-intl-locale')).toBe(locale);
    });
});
