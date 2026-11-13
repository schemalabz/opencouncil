import { RATE_LIMITED_ERROR, rateLimitedRetryAfterMs, rateLimitedSignInPath, retryAfterMinutes, signInFailurePath } from '../signInResult';

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

describe('rate-limited sign-in', () => {
    it('round-trips the wait through the sign-in URL', () => {
        const path = rateLimitedSignInPath(1234.5);
        expect(path).toBe(`/sign-in?error=${RATE_LIMITED_ERROR}&retryAfterMs=1235`);
        expect(rateLimitedRetryAfterMs(`https://opencouncil.gr${path}`)).toBe(1235);
        expect(rateLimitedRetryAfterMs(`https://opencouncil.gr/el${path}`)).toBe(1235);
    });

    it('is null for every other URL, and zero for a refusal without a wait', () => {
        expect(rateLimitedRetryAfterMs('https://opencouncil.gr/api/auth/verify-request?provider=resend&type=email')).toBeNull();
        expect(rateLimitedRetryAfterMs('https://opencouncil.gr/sign-in?error=Configuration')).toBeNull();
        expect(rateLimitedRetryAfterMs(`https://opencouncil.gr/sign-in?error=${RATE_LIMITED_ERROR}`)).toBe(0);
        expect(rateLimitedRetryAfterMs(`https://opencouncil.gr/sign-in?error=${RATE_LIMITED_ERROR}&retryAfterMs=-5`)).toBe(0);
    });

    it('tells a reader whole minutes, never zero', () => {
        expect(retryAfterMinutes(0)).toBe(1);
        expect(retryAfterMinutes(60_000)).toBe(1);
        expect(retryAfterMinutes(60_001)).toBe(2);
        expect(retryAfterMinutes(45 * 60_000)).toBe(45);
    });
});
