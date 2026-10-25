import { signInAllowed } from '../signInGuard';

describe('signInAllowed', () => {
    it('admits Google only with a verified email', () => {
        expect(signInAllowed({ provider: 'google' }, { email_verified: true }, undefined)).toBe(true);
        expect(signInAllowed({ provider: 'google' }, { email_verified: false }, undefined)).toBe(false);
        expect(signInAllowed({ provider: 'google' }, { email_verified: null }, undefined)).toBe(false);
        expect(signInAllowed({ provider: 'google' }, {}, undefined)).toBe(false);
        expect(signInAllowed({ provider: 'google' }, undefined, undefined)).toBe(false);
    });

    it('lets every other provider through', () => {
        expect(signInAllowed({ provider: 'resend' }, undefined, undefined)).toBe(true);
        expect(signInAllowed({ provider: 'resend' }, undefined, { email: 'reader@example.com' })).toBe(true);
        expect(signInAllowed(null, undefined, undefined)).toBe(true);
    });

    it('refuses a machine account on every provider, by the row and by the address alone', () => {
        // The row, when Auth.js found the account.
        expect(signInAllowed({ provider: 'resend' }, undefined, { email: 'paola@machines.opencouncil.invalid', isMachine: true })).toBe(false);
        // The address alone, when it did not (a magic link asked for the address).
        expect(signInAllowed({ provider: 'resend' }, undefined, { email: 'paola@machines.opencouncil.invalid' })).toBe(false);
        expect(signInAllowed({ provider: 'google' }, { email_verified: true }, { email: 'paola@machines.opencouncil.invalid' })).toBe(false);
        // The flag alone, whatever the address says.
        expect(signInAllowed({ provider: 'resend' }, undefined, { email: 'paola@example.com', isMachine: true })).toBe(false);
    });
});
