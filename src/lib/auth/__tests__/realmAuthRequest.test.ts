import { realmOAuthUrl } from '../realmAuthRequest';

const BASE = 'https://opencouncil.gr';
// Behind the proxy the request URL names the server's bind address.
const INTERNAL = 'http://0.0.0.0:3000';

function headers(values: Record<string, string>): Headers {
    return new Headers(values);
}

describe('realmOAuthUrl', () => {
    it('keeps a Google route on the realm apex it arrived on, over https when the proxy says so', () => {
        expect(
            realmOAuthUrl(`${INTERNAL}/api/auth/signin/google`, headers({ host: 'opencouncil.rs', 'x-forwarded-proto': 'https' }), BASE),
        ).toBe('https://opencouncil.rs/api/auth/signin/google');
        expect(
            realmOAuthUrl(
                `${INTERNAL}/api/auth/callback/google?code=abc&state=xyz`,
                headers({ 'x-forwarded-host': 'opencouncil.fr', host: 'internal-lb', 'x-forwarded-proto': 'https' }),
                BASE,
            ),
        ).toBe('https://opencouncil.fr/api/auth/callback/google?code=abc&state=xyz');
    });

    it("leaves the deployment's own host to next-auth", () => {
        expect(
            realmOAuthUrl(`${INTERNAL}/api/auth/signin/google`, headers({ host: 'opencouncil.gr', 'x-forwarded-proto': 'https' }), BASE),
        ).toBeNull();
    });

    it('leaves every other Auth.js route to next-auth', () => {
        for (const path of ['/api/auth/callback/resend', '/api/auth/session', '/api/auth/csrf', '/api/auth/signout', '/api/auth/signin/googlex']) {
            expect(realmOAuthUrl(`${INTERNAL}${path}`, headers({ host: 'opencouncil.rs' }), BASE)).toBeNull();
        }
    });

    it('never adopts a host outside the realm apexes', () => {
        for (const host of ['evil.example.com', 'data.opencouncil.gr', 'opencouncil.rs.evil.com', 'pr-7.opencouncil.dev']) {
            expect(realmOAuthUrl(`${INTERNAL}/api/auth/signin/google`, headers({ host }), BASE)).toBeNull();
        }
        expect(realmOAuthUrl(`${INTERNAL}/api/auth/signin/google`, headers({}), BASE)).toBeNull();
    });

    it('keeps a port the realm host names, and no other', () => {
        expect(realmOAuthUrl(`${INTERNAL}/api/auth/signin/google`, headers({ host: 'opencouncil.rs:8443', 'x-forwarded-proto': 'https' }), BASE)).toBe(
            'https://opencouncil.rs:8443/api/auth/signin/google',
        );
    });

    it('does not downgrade to http, and keeps http without a forwarded https', () => {
        expect(
            realmOAuthUrl('https://0.0.0.0/api/auth/signin/google', headers({ host: 'opencouncil.rs', 'x-forwarded-proto': 'http' }), BASE),
        ).toBe('https://opencouncil.rs/api/auth/signin/google');
        expect(realmOAuthUrl(`${INTERNAL}/api/auth/signin/google`, headers({ host: 'opencouncil.rs' }), BASE)).toBe(
            'http://opencouncil.rs/api/auth/signin/google',
        );
    });
});
