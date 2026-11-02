jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

jest.mock('@/lib/auth/grants.server', () => ({
    isRealmAdmin: jest.fn(),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';
import { auth } from '@/auth';
import { isRealmAdmin } from '@/lib/auth/grants.server';

const mockAuth = auth as unknown as jest.Mock;
const mockIsRealmAdmin = isRealmAdmin as jest.Mock;

const get = (path: string) => proxy(new NextRequest(`https://opencouncil.gr${path}`, { headers: { host: 'opencouncil.gr' } }));
const redirectPath = (res: Response | undefined) => {
    const location = res?.headers.get('location');
    return location ? new URL(location).pathname : null;
};

/** The /admin tree admits a superadmin and a realm admin (#875). */
describe('proxy admin gate', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends a person with no admin grant to sign in', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: false } });
        mockIsRealmAdmin.mockResolvedValue(false);

        expect(redirectPath(await get('/admin/cities'))).toBe('/sign-in');
    });

    it.each(['/admin/users', '/admin/machines', '/admin/cache', '/admin/qr/some-campaign'])(
        'sends a realm admin from the superadmin page %s to the dashboard',
        async (path) => {
            mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: false } });
            mockIsRealmAdmin.mockResolvedValue(true);

            expect(redirectPath(await get(path))).toBe('/admin');
        },
    );

    it('keeps the language of a superadmin page in the redirect', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: false } });
        mockIsRealmAdmin.mockResolvedValue(true);

        expect(redirectPath(await get('/en/admin/users'))).toBe('/en/admin');
    });

    it.each(['/admin', '/admin/cities', '/admin/team', '/admin/users-guide'])('lets a realm admin open %s', async (path) => {
        mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: false } });
        mockIsRealmAdmin.mockResolvedValue(true);

        expect(redirectPath(await get(path))).not.toBe('/admin');
        expect(redirectPath(await get(path))).not.toBe('/sign-in');
    });

    it('lets a superadmin open a superadmin page', async () => {
        mockAuth.mockResolvedValue({ user: { id: 'u1', isSuperAdmin: true } });

        const res = await get('/admin/users');

        expect(redirectPath(res)).not.toBe('/admin');
        expect(redirectPath(res)).not.toBe('/sign-in');
    });
});
