jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

// Every first segment is a city here, so that the proxy does not read the database.
jest.mock('@/lib/db/cityRealm', () => ({
    isCityOfRealm: jest.fn(async () => true),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

/**
 * youth.opencouncil.gr redirects to the directory of the youth councils on
 * the apex of its realm (#829). The host serves no page itself: every other
 * path goes to the same path on the apex.
 */
describe('proxy body-type host redirect', () => {
    const host = 'youth.opencouncil.gr';
    const request = (path: string, requestHost = host) =>
        proxy(new NextRequest(`https://${requestHost}${path}`, { headers: { host: requestHost } }));

    async function redirectOf(path: string) {
        const res = await request(path);
        return { status: res!.status, location: res!.headers.get('location') };
    }

    it('sends the root of the host to the directory on the apex', async () => {
        expect(await redirectOf('/')).toEqual({ status: 301, location: 'https://opencouncil.gr/bodies/youthCouncil' });
    });

    it('keeps a locale prefix of the realm', async () => {
        expect(await redirectOf('/en')).toEqual({ status: 301, location: 'https://opencouncil.gr/en/bodies/youthCouncil' });
        expect(await redirectOf('/en/')).toEqual({ status: 301, location: 'https://opencouncil.gr/en/bodies/youthCouncil' });
    });

    it('sends the prefix of the default locale to the unprefixed directory, in one hop', async () => {
        expect(await redirectOf('/el')).toEqual({ status: 301, location: 'https://opencouncil.gr/bodies/youthCouncil' });
    });

    it('sends every other path, with its query, to the same path on the apex', async () => {
        expect(await redirectOf('/chania?x=1')).toEqual({ status: 301, location: 'https://opencouncil.gr/chania?x=1' });
        expect(await redirectOf('/en/chania/notifications')).toEqual({ status: 301, location: 'https://opencouncil.gr/en/chania/notifications' });
        // A locale the realm does not use is a path like any other: the apex sends it away.
        expect(await redirectOf('/fr')).toEqual({ status: 301, location: 'https://opencouncil.gr/fr' });
    });

    it('leaves the apex alone', async () => {
        const res = await request('/chania', 'opencouncil.gr');
        expect(res?.headers.get('location') ?? null).toBeNull();
        expect(res?.status ?? 200).toBe(200);
    });
});
