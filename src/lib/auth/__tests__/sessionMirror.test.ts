import { env } from '@/env.mjs';
import { callbackUrlCookieName, usesSecureCookies } from '../sessionMirror';

// A mutable stand-in: the functions read NEXTAUTH_URL at call time.
jest.mock('@/env.mjs', () => ({ env: {} }));
const mutableEnv = env as { NEXTAUTH_URL?: string };

describe('usesSecureCookies', () => {
    afterEach(() => {
        delete mutableEnv.NEXTAUTH_URL;
    });

    it('is false when NEXTAUTH_URL is absent (the Nix build loads src/auth.ts without it)', () => {
        expect(usesSecureCookies()).toBe(false);
        expect(callbackUrlCookieName()).toBe('authjs.callback-url');
    });

    it('follows the protocol of NEXTAUTH_URL', () => {
        mutableEnv.NEXTAUTH_URL = 'https://opencouncil.gr';
        expect(usesSecureCookies()).toBe(true);
        expect(callbackUrlCookieName()).toBe('__Secure-authjs.callback-url');

        mutableEnv.NEXTAUTH_URL = 'http://localhost:3000';
        expect(usesSecureCookies()).toBe(false);
    });
});
