import { signInAllowed } from '../signInGuard';

describe('signInAllowed', () => {
    it('admits Google only with a verified email', () => {
        expect(signInAllowed({ provider: 'google' }, { email_verified: true })).toBe(true);
        expect(signInAllowed({ provider: 'google' }, { email_verified: false })).toBe(false);
        expect(signInAllowed({ provider: 'google' }, { email_verified: null })).toBe(false);
        expect(signInAllowed({ provider: 'google' }, {})).toBe(false);
        expect(signInAllowed({ provider: 'google' }, undefined)).toBe(false);
    });

    it('lets every other provider through', () => {
        expect(signInAllowed({ provider: 'resend' }, undefined)).toBe(true);
        expect(signInAllowed(null, undefined)).toBe(true);
    });
});
