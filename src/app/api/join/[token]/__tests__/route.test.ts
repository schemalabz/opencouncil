/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

const mockClaimPerson = jest.fn();
const mockGetJoinPerson = jest.fn();
jest.mock('@/lib/db/personClaim', () => ({
    claimPerson: (...args: unknown[]) => mockClaimPerson(...args),
    getJoinPerson: (...args: unknown[]) => mockGetJoinPerson(...args),
}));

const mockAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/discord', () => ({ sendPersonClaimedAdminAlert: (...args: unknown[]) => mockAlert(...args) }));

import { NextRequest } from 'next/server';
import { generatePersonClaimToken } from '@/lib/auth/personClaim';
import { GET } from '../route';

const scan = (token: string, query = '') => new NextRequest(new URL(`/api/join/${token}${query}`, 'https://opencouncil.cy'));
const params = (token: string) => ({ params: Promise.resolve({ token }) });
const location = (res: Response) => new URL(res.headers.get('location') as string, 'https://opencouncil.cy');

beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockClaimPerson.mockReset();
    mockGetJoinPerson.mockReset();
    mockAlert.mockClear();
    mockGetJoinPerson.mockResolvedValue({ id: 'person-1', cityId: 'chania' });
});

describe('GET /api/join/[token]', () => {
    it('sends a code to the join flow of its city, with the code in the query and the utm parameters kept', async () => {
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, '?utm_source=qr&utm_content=person-1'), params(token));
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toMatch(/^\/chania\/join\?/);
        expect(location(res).searchParams.get('c')).toBe(token);
        expect(location(res).searchParams.get('utm_content')).toBe('person-1');
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it('claims nothing without the mark of the email link, even when signed in: the page asks first', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token), params(token));
        expect(mockClaimPerson).not.toHaveBeenCalled();
        expect(location(res).searchParams.has('step')).toBe(false);
    });

    it('claims for the link in the email and opens the flow on its last step', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
        mockClaimPerson.mockResolvedValue({ status: 'linked', cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, '?confirmed=1'), params(token));
        expect(mockClaimPerson).toHaveBeenCalledWith('user-1', 'person-1');
        expect(mockAlert).toHaveBeenCalledWith({ cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        expect(location(res).pathname).toBe('/chania/join');
        expect(location(res).searchParams.get('step')).toBe('3');
        expect(location(res).searchParams.has('confirmed')).toBe(false);
    });

    it('sends a refused claim to the flow too, without an alert: the page says why', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-2' });
        mockClaimPerson.mockResolvedValue({ status: 'already_linked' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, '?confirmed=1'), params(token));
        expect(location(res).pathname).toBe('/chania/join');
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('does not claim for the email link when the session did not take', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, '?confirmed=1'), params(token));
        expect(mockClaimPerson).not.toHaveBeenCalled();
        expect(location(res).pathname).toBe('/chania/join');
    });

    it('sends a forged or expired code, or a person that is gone, to /claim without touching the session', async () => {
        const forged = await GET(scan('forged.token', '?utm_source=qr'), params('forged.token'));
        expect(forged.headers.get('location')).toBe('/claim?utm_source=qr&claim=invalid');
        const expired = generatePersonClaimToken('person-1', new Date(Date.now() - 1000));
        expect((await GET(scan(expired), params(expired))).headers.get('location')).toBe('/claim?claim=invalid');
        mockGetJoinPerson.mockResolvedValue(null);
        const token = generatePersonClaimToken('gone');
        expect((await GET(scan(token), params(token))).headers.get('location')).toBe('/claim?claim=invalid');
        expect(mockGetCurrentUser).not.toHaveBeenCalled();
    });
});
