import { signInPath, postSignInFallback, resolvePostSignInPath } from '../signInDestination';

describe('signInDestination', () => {
    describe('signInPath', () => {
        it('returns /sign-in when no destination is provided', () => {
            expect(signInPath()).toBe('/sign-in');
            expect(signInPath(null)).toBe('/sign-in');
            expect(signInPath('')).toBe('/sign-in');
        });

        it('encodes the destination parameter in callbackUrl', () => {
            expect(signInPath('/profile')).toBe('/sign-in?callbackUrl=%2Fprofile');
            expect(signInPath('/en/meetings/10')).toBe('/sign-in?callbackUrl=%2Fen%2Fmeetings%2F10');
            expect(signInPath('/chania/meetings/dec23_2025?tab=agenda#item-1')).toBe(
                '/sign-in?callbackUrl=%2Fchania%2Fmeetings%2Fdec23_2025%3Ftab%3Dagenda%23item-1',
            );
        });

        it('avoids adding redundant callbackUrl when destination is sign-in itself', () => {
            expect(signInPath('/sign-in')).toBe('/sign-in');
            expect(signInPath('/en/sign-in')).toBe('/sign-in');
            expect(signInPath('/sign-in?callbackUrl=/profile')).toBe('/sign-in');
        });

        it('avoids adding callbackUrl when destination is homepage so new users do not skip onboarding', () => {
            expect(signInPath('/')).toBe('/sign-in');
            expect(signInPath('/en')).toBe('/sign-in');
            expect(signInPath('/lat')).toBe('/sign-in');
        });
    });

    describe('postSignInFallback', () => {
        it('returns / for onboarded users', () => {
            expect(postSignInFallback(true)).toBe('/');
        });

        it('returns /profile for users who are not onboarded', () => {
            expect(postSignInFallback(false)).toBe('/profile');
        });
    });

    describe('resolvePostSignInPath', () => {
        it('preserves an explicit safe callbackUrl for onboarded users', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: '/chania/meetings/123',
                onboarded: true,
            });
            expect(destination).toBe('/chania/meetings/123');
        });

        it('preserves an explicit safe callbackUrl for non-onboarded users', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: '/mcp',
                onboarded: false,
            });
            expect(destination).toBe('/mcp');
        });

        it('falls back to / when callbackUrl is null and user is onboarded', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: null,
                onboarded: true,
            });
            expect(destination).toBe('/');
        });

        it('falls back to /profile when callbackUrl is null and user is not onboarded', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: null,
                onboarded: false,
            });
            expect(destination).toBe('/profile');
        });

        it('prevents redirect loop when callbackUrl is sign-in itself', () => {
            expect(
                resolvePostSignInPath({
                    callbackUrl: '/sign-in',
                    onboarded: true,
                }),
            ).toBe('/');

            expect(
                resolvePostSignInPath({
                    callbackUrl: '/en/sign-in',
                    onboarded: false,
                    fallback: '/en/profile',
                }),
            ).toBe('/en/profile');
        });

        it('redirects non-onboarded readers to profile even if callbackUrl was homepage', () => {
            expect(
                resolvePostSignInPath({
                    callbackUrl: '/',
                    onboarded: false,
                }),
            ).toBe('/profile');

            expect(
                resolvePostSignInPath({
                    callbackUrl: '/en',
                    onboarded: false,
                    fallback: '/en/profile',
                }),
            ).toBe('/en/profile');
        });

        it('rejects protocol-relative URLs and uses onboarded fallback', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: '//evil.com/phish',
                onboarded: true,
            });
            expect(destination).toBe('/');
        });

        it('rejects protocol-relative URLs and uses non-onboarded fallback', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: '//evil.com/phish',
                onboarded: false,
            });
            expect(destination).toBe('/profile');
        });

        it('rejects external URLs and uses onboarded fallback', () => {
            const destination = resolvePostSignInPath({
                callbackUrl: 'https://evil.com',
                onboarded: true,
            });
            expect(destination).toBe('/');
        });

        it('respects a custom locale-prefixed fallback', () => {
            const destinationOnboarded = resolvePostSignInPath({
                callbackUrl: null,
                onboarded: true,
                fallback: '/en',
            });
            expect(destinationOnboarded).toBe('/en');

            const destinationNotOnboarded = resolvePostSignInPath({
                callbackUrl: '//evil.com',
                onboarded: false,
                fallback: '/en/profile',
            });
            expect(destinationNotOnboarded).toBe('/en/profile');
        });
    });
});
