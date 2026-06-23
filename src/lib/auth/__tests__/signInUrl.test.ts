import { signInUrlForRequest } from '../signInUrl';

const reqWith = (headers: Record<string, string>) =>
    new Request('https://internal.local/api/auth/signin', { headers });

describe('signInUrlForRequest', () => {
    const greekUrl =
        'https://opencouncil.gr/api/auth/callback/resend?callbackUrl=%2Fprofile&token=abc123&email=user%40example.com';

    it('repoints the magic link to the French host when signing in on .fr', () => {
        const result = signInUrlForRequest(greekUrl, reqWith({ host: 'opencouncil.fr' }));
        const u = new URL(result);
        expect(u.host).toBe('opencouncil.fr');
        expect(u.protocol).toBe('https:');
    });

    it('preserves the path and query (token + callbackUrl) when rewriting', () => {
        const result = signInUrlForRequest(greekUrl, reqWith({ host: 'opencouncil.fr' }));
        const u = new URL(result);
        expect(u.pathname).toBe('/api/auth/callback/resend');
        expect(u.searchParams.get('token')).toBe('abc123');
        expect(u.searchParams.get('email')).toBe('user@example.com');
        expect(u.searchParams.get('callbackUrl')).toBe('/profile');
    });

    it('prefers x-forwarded-host over host (behind a proxy/LB)', () => {
        const result = signInUrlForRequest(
            greekUrl,
            reqWith({ host: 'internal.local:8080', 'x-forwarded-host': 'opencouncil.fr' })
        );
        expect(new URL(result).host).toBe('opencouncil.fr');
    });

    it('uses x-forwarded-proto when provided', () => {
        const result = signInUrlForRequest(
            'http://opencouncil.gr/api/auth/callback/resend?token=t',
            reqWith({ host: 'opencouncil.fr', 'x-forwarded-proto': 'https' })
        );
        expect(new URL(result).protocol).toBe('https:');
    });

    it('leaves the dev URL untouched (localhost over http, no forwarded headers)', () => {
        const devUrl = 'http://localhost:3000/api/auth/callback/resend?token=t';
        const result = signInUrlForRequest(devUrl, reqWith({ host: 'localhost:3000' }));
        const u = new URL(result);
        expect(u.protocol).toBe('http:');
        expect(u.host).toBe('localhost:3000');
        expect(result).toBe(devUrl);
    });

    it('is a no-op for the same host (.gr signing in on .gr)', () => {
        const result = signInUrlForRequest(greekUrl, reqWith({ host: 'opencouncil.gr' }));
        expect(result).toBe(greekUrl);
    });

    it('returns the original URL when no host header is present', () => {
        const result = signInUrlForRequest(greekUrl, reqWith({}));
        expect(result).toBe(greekUrl);
    });

    it('rejects an attacker-supplied host (not a known domain) and does not rewrite', () => {
        const result = signInUrlForRequest(greekUrl, reqWith({ 'x-forwarded-host': 'evil.com' }));
        expect(result).toBe(greekUrl);
    });

    it('allows a preview subdomain of a realm domain', () => {
        const result = signInUrlForRequest(
            greekUrl,
            reqWith({ 'x-forwarded-host': 'pr-7.preview.opencouncil.fr' })
        );
        expect(new URL(result).host).toBe('pr-7.preview.opencouncil.fr');
    });

    it('takes the first value of a comma-separated forwarded header', () => {
        const result = signInUrlForRequest(
            greekUrl,
            reqWith({ 'x-forwarded-host': 'opencouncil.fr, internal-lb.local' })
        );
        expect(new URL(result).host).toBe('opencouncil.fr');
    });
});
