jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

/**
 * youth.opencouncil.gr opens on the directory of the youth councils (#829):
 * the root rewrites to it, in the locale the path names, with next-intl's
 * request locale header as the realm-locale rewrite carries it. Every other
 * path on the host serves as on the apex.
 */
describe('proxy body-type host entry', () => {
    const host = 'youth.opencouncil.gr';

    it('rewrites the root of the host to the directory in the default locale', async () => {
        const res = await proxy(new NextRequest(`https://${host}/`, { headers: { host } }));

        expect(res).toBeDefined();
        expect(new URL(res!.headers.get('x-middleware-rewrite')!).pathname).toBe('/el/bodies/youthCouncil');
        expect(res!.headers.get('x-middleware-request-x-next-intl-locale')).toBe('el');
    });

    it('keeps an explicit locale prefix', async () => {
        const res = await proxy(new NextRequest(`https://${host}/en`, { headers: { host } }));

        expect(new URL(res!.headers.get('x-middleware-rewrite')!).pathname).toBe('/en/bodies/youthCouncil');
        expect(res!.headers.get('x-middleware-request-x-next-intl-locale')).toBe('en');
    });

    it('serves the directory for the explicit default prefix too, which next-intl would redirect away', async () => {
        const res = await proxy(new NextRequest(`https://${host}/el`, { headers: { host } }));

        expect(res!.status).toBe(200);
        expect(new URL(res!.headers.get('x-middleware-rewrite')!).pathname).toBe('/el/bodies/youthCouncil');
    });

    it('serves a city page on the host as the apex does', async () => {
        const res = await proxy(new NextRequest(`https://${host}/chania`, { headers: { host } }));

        const rewrite = res?.headers.get('x-middleware-rewrite');
        expect(rewrite === null || rewrite === undefined || new URL(rewrite).pathname === '/el/chania').toBe(true);
    });

    it('still sends a foreign locale prefix away', async () => {
        const res = await proxy(new NextRequest(`https://${host}/fr`, { headers: { host } }));

        expect(res!.status).toBe(301);
        expect(new URL(res!.headers.get('location')!).pathname).toBe('/');
    });
});
