/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod',
        NEXTAUTH_URL: 'https://opencouncil.gr',
    },
}));

import {
    generateUnsubscribeToken,
    verifyUnsubscribeToken,
    buildUnsubscribeUrl,
} from '@/lib/notifications/tokens';

describe('generateUnsubscribeToken / verifyUnsubscribeToken', () => {
    it('round-trips a valid token back to the original userId and cityId', async () => {
        const token = await generateUnsubscribeToken('user-1', 'city-1');
        const data = await verifyUnsubscribeToken(token);

        expect(data).not.toBeNull();
        expect(data!.userId).toBe('user-1');
        expect(data!.cityId).toBe('city-1');
        expect(data!.exp).toBeGreaterThan(Date.now());
    });

    it('round-trips a token without cityId', async () => {
        const token = await generateUnsubscribeToken('user-1');
        const data = await verifyUnsubscribeToken(token);

        expect(data).not.toBeNull();
        expect(data!.userId).toBe('user-1');
        expect(data!.cityId).toBeUndefined();
    });

    it('omits cityId from the payload when not provided', async () => {
        const token = await generateUnsubscribeToken('user-1');
        const [payload] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));

        expect(decoded).not.toHaveProperty('cityId');
    });

    it('still accepts a token minted before kinds existed, but only with a userId', async () => {
        const sign = (data: object) => {
            const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
            const signature = require('crypto').createHmac('sha256', 'test-secret-do-not-use-in-prod').update(payload).digest('base64url');
            return `${payload}.${signature}`;
        };
        const exp = Date.now() + 1000;
        expect(await verifyUnsubscribeToken(sign({ userId: 'user-1', exp }))).toMatchObject({ userId: 'user-1' });
        // An unkinded token of another shape must not pass as "every user".
        expect(await verifyUnsubscribeToken(sign({ personId: 'person-1', exp }))).toBeNull();
        expect(await verifyUnsubscribeToken(sign({ userId: 42, exp }))).toBeNull();
    });

    it('produces tokens in the form payload.signature', async () => {
        const token = await generateUnsubscribeToken('u', 'c');
        expect(token.split('.')).toHaveLength(2);
    });

    it('returns null for a token with a tampered payload', async () => {
        const token = await generateUnsubscribeToken('user-1', 'city-1');
        const [, signature] = token.split('.');

        const forgedPayload = Buffer.from(
            JSON.stringify({ userId: 'not-user-1', cityId: 'city-1', exp: Date.now() + 1000 })
        ).toString('base64url');

        expect(await verifyUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeNull();
    });

    it('returns null for a token with a tampered signature', async () => {
        const token = await generateUnsubscribeToken('user-1', 'city-1');
        const [payload] = token.split('.');
        expect(await verifyUnsubscribeToken(`${payload}.bogus`)).toBeNull();
    });

    it('returns null for malformed tokens', async () => {
        expect(await verifyUnsubscribeToken('')).toBeNull();
        expect(await verifyUnsubscribeToken('no-dot-here')).toBeNull();
        expect(await verifyUnsubscribeToken('.only-signature')).toBeNull();
        expect(await verifyUnsubscribeToken('only-payload.')).toBeNull();
    });

    it('returns null for an expired token', async () => {
        const token = await generateUnsubscribeToken('user-1', 'city-1');
        const realNow = Date.now;
        try {
            Date.now = () => realNow() + 31 * 24 * 60 * 60 * 1000; // +31 days
            expect(await verifyUnsubscribeToken(token)).toBeNull();
        } finally {
            Date.now = realNow;
        }
    });
});

describe('buildUnsubscribeUrl', () => {
    it("links to the realm's domain, in that realm's language", async () => {
        const url = await buildUnsubscribeUrl('user-1', { cityId: 'city-1', realm: 'france' });
        expect(url.startsWith('https://opencouncil.fr/fr/unsubscribe?token=')).toBe(true);
    });

    it('defaults to the /el/ locale for a Greek city', async () => {
        const url = await buildUnsubscribeUrl('user-1', { cityId: 'city-1', realm: 'greece' });
        expect(url.startsWith('https://opencouncil.gr/el/unsubscribe?token=')).toBe(true);
    });

    it('keeps the configured host and Greek without a realm', async () => {
        const url = await buildUnsubscribeUrl('user-1', { cityId: 'city-1' });
        expect(url.startsWith('https://opencouncil.gr/el/unsubscribe?token=')).toBe(true);
    });

    it('interpolates the provided locale into the path', async () => {
        const url = await buildUnsubscribeUrl('user-1', { cityId: 'city-1', locale: 'en' });
        expect(url.startsWith('https://opencouncil.gr/en/unsubscribe?token=')).toBe(true);
    });

    it('produces a URL whose token round-trips through verify', async () => {
        const url = await buildUnsubscribeUrl('user-1', { cityId: 'city-1' });
        const token = decodeURIComponent(url.split('token=')[1]);

        const data = await verifyUnsubscribeToken(token);
        expect(data).not.toBeNull();
        expect(data!.userId).toBe('user-1');
        expect(data!.cityId).toBe('city-1');
    });

    it('builds a city-less URL', async () => {
        const url = await buildUnsubscribeUrl('user-1');
        expect(url.startsWith('https://opencouncil.gr/el/unsubscribe?token=')).toBe(true);

        const token = decodeURIComponent(url.split('token=')[1]);
        const data = await verifyUnsubscribeToken(token);
        expect(data).not.toBeNull();
        expect(data!.userId).toBe('user-1');
        expect(data!.cityId).toBeUndefined();
    });
});
