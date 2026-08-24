/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret' },
}));

import { mintCallbackToken, verifyCallbackToken } from './callbackToken';

describe('callback token', () => {
    it('verifies a token it minted', () => {
        const token = mintCallbackToken('task1');
        expect(verifyCallbackToken('task1', token)).toBe(true);
    });

    it('rejects a token minted for another task', () => {
        const token = mintCallbackToken('task1');
        expect(verifyCallbackToken('task2', token)).toBe(false);
    });

    it('rejects a tampered token', () => {
        const token = mintCallbackToken('task1');
        const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1);
        expect(verifyCallbackToken('task1', tampered)).toBe(false);
    });

    it('rejects garbage that is not hex or the wrong length', () => {
        expect(verifyCallbackToken('task1', 'not-a-token')).toBe(false);
        expect(verifyCallbackToken('task1', '')).toBe(false);
        expect(verifyCallbackToken('task1', 'abcd')).toBe(false);
    });
});
