/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

const mockClaimPerson = jest.fn();
const mockClaimableStatus = jest.fn();
jest.mock('@/lib/db/personClaim', () => ({
    claimPerson: (...args: unknown[]) => mockClaimPerson(...args),
    getClaimablePersonStatus: (...args: unknown[]) => mockClaimableStatus(...args),
}));

const mockAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/discord', () => ({ sendPersonClaimedAdminAlert: (...args: unknown[]) => mockAlert(...args) }));

import { NextRequest } from 'next/server';
import { generatePersonClaimToken } from '@/lib/auth/personClaim';
import { GET } from '../route';

const scan = (token: string, query = '') => new NextRequest(new URL(`/api/join/${token}${query}`, 'https://opencouncil.cy'));
const params = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockClaimPerson.mockReset();
    mockClaimableStatus.mockReset();
    mockAlert.mockClear();
});

describe('GET /api/join/[token]', () => {
    it('sends a signed-out scan of a claimable code to sign in and back here, keeping the utm parameters', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        mockClaimableStatus.mockResolvedValue('claimable');
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, '?utm_source=qr&utm_content=person-1'), params(token));
        expect(res.status).toBe(302);
        const location = new URL(res.headers.get('location') as string, 'https://opencouncil.cy');
        expect(location.origin).toBe('https://opencouncil.cy');
        expect(location.pathname).toBe('/sign-in');
        expect(location.searchParams.get('callbackUrl')).toBe(`/api/join/${token}`);
        expect(location.searchParams.get('utm_content')).toBe('person-1');
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it('links the signed-in user and reports it on the profile', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
        mockClaimPerson.mockResolvedValue({ status: 'linked', cityId: 'chania', personName: 'Α. Β.' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token), params(token));
        expect(mockClaimPerson).toHaveBeenCalledWith('user-1', 'person-1');
        expect(res.headers.get('location')).toBe('/profile?claim=linked');
        expect(mockAlert).toHaveBeenCalledWith({ cityId: 'chania', personName: 'Α. Β.' });
    });

    it('passes a refusal through without an alert', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-2' });
        mockClaimPerson.mockResolvedValue({ status: 'already_linked' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token), params(token));
        expect(res.headers.get('location')).toBe('/profile?claim=already_linked');
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('never touches the database for a forged token', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
        const res = await GET(scan('forged.token'), params('forged.token'));
        expect(res.headers.get('location')).toBe('/profile?claim=invalid');
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it('answers a signed-out scan of an expired or forged code at once, without sign-in', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        const expired = generatePersonClaimToken('person-1', new Date(Date.now() - 1000));
        const res = await GET(scan(expired, '?utm_source=qr'), params(expired));
        expect(res.headers.get('location')).toBe('/claim?utm_source=qr&claim=invalid');
        expect(mockClaimableStatus).not.toHaveBeenCalled();
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it.each(['already_linked', 'not_found'])('answers a signed-out scan of a %s person at once, without sign-in', async (status) => {
        mockGetCurrentUser.mockResolvedValue(null);
        mockClaimableStatus.mockResolvedValue(status);
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token), params(token));
        expect(mockClaimableStatus).toHaveBeenCalledWith('person-1');
        expect(res.headers.get('location')).toBe(`/claim?claim=${status}`);
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it('stays relative, so the scan finishes on the realm printed on the sheet', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        mockClaimableStatus.mockResolvedValue('claimable');
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token), params(token));
        expect(res.headers.get('location')).toMatch(/^\/sign-in\?/);
    });
});
