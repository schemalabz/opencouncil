jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

const mockAuth = jest.fn();
jest.mock('@/auth', () => ({
    auth: () => mockAuth(),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

describe('proxy admin gate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('redirects signed-out visitor accessing /admin to /sign-in with callbackUrl', async () => {
        mockAuth.mockResolvedValue(null);
        const req = new NextRequest('https://opencouncil.gr/admin', { headers: { host: 'opencouncil.gr' } });

        const res = await proxy(req);

        expect(res).toBeDefined();
        const location = res!.headers.get('location');
        expect(location).toBe('https://opencouncil.gr/sign-in?callbackUrl=%2Fadmin');
    });

    it('redirects signed-out visitor accessing /en/admin to /sign-in with locale in callbackUrl', async () => {
        mockAuth.mockResolvedValue(null);
        const req = new NextRequest('https://opencouncil.gr/en/admin', { headers: { host: 'opencouncil.gr' } });

        const res = await proxy(req);

        expect(res).toBeDefined();
        const location = res!.headers.get('location');
        expect(location).toBe('https://opencouncil.gr/sign-in?callbackUrl=%2Fen%2Fadmin');
    });

    it('redirects signed-in non-superadmin to /sign-in without callbackUrl to prevent loops', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'user-1', isSuperAdmin: false },
        });
        const req = new NextRequest('https://opencouncil.gr/admin', { headers: { host: 'opencouncil.gr' } });

        const res = await proxy(req);

        expect(res).toBeDefined();
        const location = res!.headers.get('location');
        expect(location).toBe('https://opencouncil.gr/sign-in');
    });

    it('allows signed-in superadmin to access /admin', async () => {
        mockAuth.mockResolvedValue({
            user: { id: 'admin-1', isSuperAdmin: true },
        });
        const req = new NextRequest('https://opencouncil.gr/admin', { headers: { host: 'opencouncil.gr' } });

        const res = await proxy(req);

        expect(res?.headers.get('location')).toBeNull();
    });
});
