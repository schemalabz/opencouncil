/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod' } }));

import { createHmac } from 'crypto';
import { signPayload, verifyPayload } from '@/lib/auth/signedPayload';

const exp = () => Date.now() + 60_000;
const sign = (data: object) => {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${payload}.${createHmac('sha256', 'test-secret-do-not-use-in-prod').update(payload).digest('base64url')}`;
};

describe('signPayload / verifyPayload', () => {
    it('round-trips a payload of its own kind', () => {
        const token = signPayload('person-claim', { personId: 'p', exp: exp() });
        expect(verifyPayload('person-claim', token)).toMatchObject({ personId: 'p', kind: 'person-claim' });
    });

    it('refuses a token of another kind: same secret, same format, and no wrapper guard in between', () => {
        // A claim code printed on a QR sheet must never pass as an unsubscribe link.
        expect(verifyPayload('unsubscribe', signPayload('person-claim', { personId: 'p', exp: exp() }))).toBeNull();
        expect(verifyPayload('person-claim', signPayload('unsubscribe', { userId: 'u', exp: exp() }))).toBeNull();
    });

    it('refuses a token that names no kind, unless the caller allows it', () => {
        const unkinded = sign({ userId: 'u', exp: exp() });
        expect(verifyPayload('unsubscribe', unkinded)).toBeNull();
        expect(verifyPayload('unsubscribe', unkinded, { allowUnkinded: true })).toMatchObject({ userId: 'u' });
        // allowUnkinded is for a missing kind only: a wrong kind stays refused.
        expect(verifyPayload('unsubscribe', signPayload('person-claim', { personId: 'p', exp: exp() }), { allowUnkinded: true })).toBeNull();
    });

    it('refuses a tampered signature and a tampered payload', () => {
        const token = signPayload('person-claim', { personId: 'p', exp: exp() });
        const [payload, signature] = token.split('.');
        expect(verifyPayload('person-claim', `${payload}.${signature.slice(0, -2)}AA`)).toBeNull();
        const forged = Buffer.from(JSON.stringify({ personId: 'q', kind: 'person-claim', exp: exp() })).toString('base64url');
        expect(verifyPayload('person-claim', `${forged}.${signature}`)).toBeNull();
    });

    it('refuses an expired token and a payload without an expiry', () => {
        expect(verifyPayload('person-claim', signPayload('person-claim', { personId: 'p', exp: Date.now() - 1 }))).toBeNull();
        expect(verifyPayload('person-claim', sign({ personId: 'p', kind: 'person-claim' }))).toBeNull();
    });

    it('refuses malformed tokens', () => {
        for (const token of ['', 'nodot', '.sig', 'payload.', 'not-base64.!!']) {
            expect(verifyPayload('person-claim', token)).toBeNull();
        }
    });
});
