/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod',
        NEXTAUTH_URL: 'https://opencouncil.gr',
    },
}));

import { claimExpiry, claimLastValidDay, generatePersonClaimToken, verifyPersonClaimToken, personJoinUrl } from '../personClaim';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/notifications/tokens';

describe('person claim token', () => {
    it('round-trips the personId', () => {
        const token = generatePersonClaimToken('person-1');
        expect(verifyPersonClaimToken(token)).toBe('person-1');
    });

    it('rejects a token whose payload was edited', () => {
        const token = generatePersonClaimToken('person-1');
        const [, signature] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ personId: 'person-2', exp: Date.now() + 1000 })).toString('base64url');
        expect(verifyPersonClaimToken(`${forged}.${signature}`)).toBeNull();
    });

    it('rejects an expired token', () => {
        const now = Date.now();
        const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
        const token = generatePersonClaimToken('person-1');
        spy.mockReturnValue(now + 6 * 24 * 60 * 60 * 1000);
        expect(verifyPersonClaimToken(token)).toBeNull();
        spy.mockRestore();
    });

    it('holds until the given expiry and not a millisecond after', () => {
        const now = Date.now();
        const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
        const expiresAt = new Date(now + 1000);
        const token = generatePersonClaimToken('person-1', expiresAt);
        spy.mockReturnValue(expiresAt.getTime());
        expect(verifyPersonClaimToken(token)).toBe('person-1');
        spy.mockReturnValue(expiresAt.getTime() + 1);
        expect(verifyPersonClaimToken(token)).toBeNull();
        spy.mockRestore();
    });

    it('prints a last valid day that is before the 5-day expiry', () => {
        const now = Date.UTC(2026, 8, 16, 21, 30);
        const expiresAt = claimExpiry(now);
        expect(expiresAt.getTime() - now).toBe(5 * 24 * 60 * 60 * 1000);
        expect(claimLastValidDay(expiresAt).getTime()).toBe(expiresAt.getTime() - 24 * 60 * 60 * 1000);
    });

    it('rejects garbage', () => {
        expect(verifyPersonClaimToken('')).toBeNull();
        expect(verifyPersonClaimToken('not.a.token')).toBeNull();
    });
});

describe('personJoinUrl', () => {
    it('opens the join flow of the city, on its realm, with the code in the query and per-person utm parameters', () => {
        const url = new URL(personJoinUrl({ id: 'person-1', cityId: 'chania' }, 'greece'));
        expect(url.origin).toBe('https://opencouncil.gr');
        // No dot in the path: the proxy skips dotted paths, and the page needs its locale routing.
        expect(url.pathname).toBe('/chania/join');
        expect(verifyPersonClaimToken(url.searchParams.get('c') as string)).toBe('person-1');
        expect(url.searchParams.get('utm_source')).toBe('qr');
        expect(url.searchParams.get('utm_campaign')).toBe('council-chania');
        expect(url.searchParams.get('utm_content')).toBe('person-1');
    });
});
