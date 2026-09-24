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
import { generatePersonClaimToken, signJoinConfirmation } from '@/lib/auth/personClaim';
import { GET } from '@/app/api/join/[token]/route';

const scan = (token: string, query = '') => new NextRequest(new URL(`/api/join/${token}${query}`, 'https://opencouncil.cy'));
const params = (token: string) => ({ params: Promise.resolve({ token }) });
const EMAIL = 'maria@gmail.com';
const confirmed = (token: string, at = Date.now(), email = EMAIL) => `?confirmed=${signJoinConfirmation(token, email, at)}`;
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
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: EMAIL });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token), params(token));
        expect(mockClaimPerson).not.toHaveBeenCalled();
        expect(location(res).searchParams.has('step')).toBe(false);
    });

    it('claims for the link in the email and opens the flow on its last step', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: EMAIL });
        mockClaimPerson.mockResolvedValue({ status: 'linked', cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, confirmed(token)), params(token));
        expect(mockClaimPerson).toHaveBeenCalledWith('user-1', 'person-1');
        expect(mockAlert).toHaveBeenCalledWith({ cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        expect(location(res).pathname).toBe('/chania/join');
        expect(location(res).searchParams.get('step')).toBe('3');
        expect(location(res).searchParams.has('confirmed')).toBe(false);
    });

    it('sends a refused claim to the flow too, without an alert: the page says why', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-2', email: EMAIL });
        mockClaimPerson.mockResolvedValue({ status: 'already_linked' });
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, confirmed(token)), params(token));
        expect(location(res).pathname).toBe('/chania/join');
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('does not claim for the email link when the session did not take', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        const token = generatePersonClaimToken('person-1');
        const res = await GET(scan(token, confirmed(token)), params(token));
        expect(mockClaimPerson).not.toHaveBeenCalled();
        expect(location(res).pathname).toBe('/chania/join');
    });

    it('still claims for the email link shortly after the code expired, but not a day past the grace', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: EMAIL });
        mockClaimPerson.mockResolvedValue({ status: 'linked', cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        // The email went out while the code was valid; the link is clicked after it expired.
        const justExpired = generatePersonClaimToken('person-1', new Date(Date.now() - 60 * 60 * 1000));
        const res = await GET(scan(justExpired, confirmed(justExpired, Date.now() - 2 * 60 * 60 * 1000)), params(justExpired));
        expect(mockClaimPerson).toHaveBeenCalledWith('user-1', 'person-1');
        expect(location(res).searchParams.get('step')).toBe('3');

        mockClaimPerson.mockClear();
        const longExpired = generatePersonClaimToken('person-1', new Date(Date.now() - 25 * 60 * 60 * 1000));
        const longAgo = confirmed(longExpired, Date.now() - 26 * 60 * 60 * 1000);
        expect((await GET(scan(longExpired, longAgo), params(longExpired))).headers.get('location')).toBe('/claim?claim=invalid');
        // Without the mark of the email link, an expired code gets no grace.
        expect((await GET(scan(justExpired), params(justExpired))).headers.get('location')).toBe('/claim?claim=invalid');
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it('claims nothing and extends nothing for a hand-typed or borrowed mark', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: EMAIL });
        const valid = generatePersonClaimToken('person-1');
        const handTyped = await GET(scan(valid, '?confirmed=1'), params(valid));
        expect(mockClaimPerson).not.toHaveBeenCalled();
        expect(location(handTyped).searchParams.has('step')).toBe(false);

        // A link copied into a browser that is signed in as somebody else.
        mockGetCurrentUser.mockResolvedValue({ id: 'user-2', email: 'other@gmail.com' });
        const copied = await GET(scan(valid, confirmed(valid)), params(valid));
        expect(mockClaimPerson).not.toHaveBeenCalled();
        expect(location(copied).searchParams.has('step')).toBe(false);
        // The address compares as the sign-in normalises it.
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: ' Maria@Gmail.com' });
        mockClaimPerson.mockResolvedValue({ status: 'already_yours' });
        await GET(scan(valid, confirmed(valid)), params(valid));
        expect(mockClaimPerson).toHaveBeenCalledTimes(1);
        mockClaimPerson.mockClear();
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: EMAIL });

        // A mark minted for one code does not work for another.
        const other = generatePersonClaimToken('person-2');
        await GET(scan(valid, confirmed(other)), params(valid));
        expect(mockClaimPerson).not.toHaveBeenCalled();

        // A mark minted after the code expired never grants the grace.
        const justExpired = generatePersonClaimToken('person-1', new Date(Date.now() - 60 * 60 * 1000));
        const minted = await GET(scan(justExpired, confirmed(justExpired)), params(justExpired));
        expect(minted.headers.get('location')).toBe('/claim?claim=invalid');
        expect(mockClaimPerson).not.toHaveBeenCalled();
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
