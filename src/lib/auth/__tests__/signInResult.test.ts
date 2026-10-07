import { signInFailurePath } from '../signInResult';

describe('signInFailurePath', () => {
    it('treats the verify-request URL as success', () => {
        expect(signInFailurePath('https://opencouncil.gr/api/auth/verify-request?provider=resend&type=email')).toBeNull();
    });

    it('reports our own sign-in page only when it carries an error code', () => {
        expect(signInFailurePath('https://opencouncil.gr/sign-in?error=Configuration')).toBe('/sign-in?error=Configuration');
        expect(signInFailurePath('https://opencouncil.gr/el/sign-in?error=Verification')).toBe('/el/sign-in?error=Verification');
        expect(signInFailurePath('https://opencouncil.gr/sign-in?callbackUrl=%2Fprofile')).toBeNull();
    });
});
