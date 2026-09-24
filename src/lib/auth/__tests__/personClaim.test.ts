/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod',
        NEXTAUTH_URL: 'https://opencouncil.gr',
    },
}));

import { claimExpiry, claimLastValidDay, generatePersonClaimToken, verifyPersonClaimToken, personJoinUrl } from '@/lib/auth/personClaim';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/notifications/tokens';

const PERSON = 'cm3glsk9t04ihckl367xtm18c';

describe('person claim token', () => {
    it('round-trips the personId', () => {
        const token = generatePersonClaimToken(PERSON);
        expect(verifyPersonClaimToken(token)).toBe(PERSON);
    });

    it('is short enough for a small QR: about 50 characters, all URL-safe', () => {
        const token = generatePersonClaimToken(PERSON);
        expect(token.length).toBeLessThanOrEqual(PERSON.length + 30);
        expect(token).toMatch(/^[A-Za-z0-9._-]+$/);
    });

    it('rejects a token whose person, expiry or mac was edited', () => {
        const [, exp, mac] = generatePersonClaimToken(PERSON).split('.');
        expect(verifyPersonClaimToken(`cm3glsk9t04ihckl367xtm18d.${exp}.${mac}`)).toBeNull();
        const later = (parseInt(exp, 36) + 86400).toString(36);
        expect(verifyPersonClaimToken(`${PERSON}.${later}.${mac}`)).toBeNull();
        const flipped = (mac[0] === 'A' ? 'B' : 'A') + mac.slice(1);
        expect(verifyPersonClaimToken(`${PERSON}.${exp}.${flipped}`)).toBeNull();
    });

    it('rejects an expired token', () => {
        const now = Date.now();
        const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
        const token = generatePersonClaimToken(PERSON);
        spy.mockReturnValue(now + 6 * 24 * 60 * 60 * 1000);
        expect(verifyPersonClaimToken(token)).toBeNull();
        spy.mockRestore();
    });

    it('holds until the given expiry, rounded down to the second, and not after', () => {
        const now = Date.UTC(2026, 8, 16, 10, 0, 0, 0);
        const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
        const expiresAt = new Date(now + 1500);
        const token = generatePersonClaimToken(PERSON, expiresAt);
        spy.mockReturnValue(now + 1000);
        expect(verifyPersonClaimToken(token)).toBe(PERSON);
        spy.mockReturnValue(now + 1001);
        expect(verifyPersonClaimToken(token)).toBeNull();
        spy.mockRestore();
    });

    it('prints a last valid day that is before the 5-day expiry', () => {
        const now = Date.UTC(2026, 8, 16, 21, 30);
        const expiresAt = claimExpiry(now);
        expect(expiresAt.getTime() - now).toBe(5 * 24 * 60 * 60 * 1000);
        expect(claimLastValidDay(expiresAt).getTime()).toBe(expiresAt.getTime() - 24 * 60 * 60 * 1000);
    });

    it('is not interchangeable with an unsubscribe token, in either direction', async () => {
        expect(await verifyUnsubscribeToken(generatePersonClaimToken(PERSON))).toBeNull();
        expect(verifyPersonClaimToken(await generateUnsubscribeToken('user-1'))).toBeNull();
    });

    it('rejects garbage', () => {
        for (const token of ['', 'not.a.token', `${PERSON}..`, `${PERSON}.x.y.z`, `a b.1.AAAAAAAAAAAAAAAA`, `${PERSON}.ZZ.AAAAAAAAAAAAAAAA`]) {
            expect(verifyPersonClaimToken(token)).toBeNull();
        }
    });
});

describe('personJoinUrl', () => {
    it('is the join flow of the city on its realm, with only the code: short, so the QR stays coarse', () => {
        const url = personJoinUrl({ id: PERSON, cityId: 'chania' }, 'greece');
        const parsed = new URL(url);
        expect(parsed.origin).toBe('https://opencouncil.gr');
        // No dot in the path: the proxy skips dotted paths, and the page needs its locale routing.
        expect(parsed.pathname).toBe('/chania/join');
        expect([...parsed.searchParams.keys()]).toEqual(['c']);
        expect(verifyPersonClaimToken(parsed.searchParams.get('c') as string)).toBe(PERSON);
        expect(url.length).toBeLessThan(100);
    });
});
