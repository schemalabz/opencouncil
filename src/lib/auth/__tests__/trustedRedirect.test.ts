import { isTrustedExternalRedirect } from '../trustedRedirect';

/**
 * The post-auth redirect allowlist. This is a security boundary: anything it
 * accepts becomes a sign-in round-trip target, so the exclusions matter as
 * much as the inclusions — data.opencouncil.gr hosts attacker-uploadable
 * content and must never pass.
 */
describe('isTrustedExternalRedirect', () => {
    it('accepts the notis hosts over https', () => {
        expect(isTrustedExternalRedirect('https://notis.opencouncil.gr/admin')).toBe(true);
        expect(isTrustedExternalRedirect('https://notis.staging.opencouncil.gr/admin')).toBe(true);
    });

    it('accepts paired notis preview hosts', () => {
        expect(isTrustedExternalRedirect('https://notis-pr-632.opencouncil.dev/admin')).toBe(true);
        expect(isTrustedExternalRedirect('https://notis-pr-7.opencouncil.dev/')).toBe(true);
    });

    it('rejects lookalikes of the preview pattern', () => {
        expect(isTrustedExternalRedirect('https://notis-pr-1.opencouncil.dev.evil.com/')).toBe(false);
        expect(isTrustedExternalRedirect('https://evil-notis-pr-1.opencouncil.dev/')).toBe(false);
        expect(isTrustedExternalRedirect('https://notis-pr-x.opencouncil.dev/')).toBe(false);
        expect(isTrustedExternalRedirect('https://pr-1.opencouncil.dev/')).toBe(false);
    });

    it('rejects other subdomains — no wildcard over the apex', () => {
        expect(isTrustedExternalRedirect('https://data.opencouncil.gr/anything')).toBe(false);
        expect(isTrustedExternalRedirect('https://anything.opencouncil.gr/')).toBe(false);
    });

    it('rejects http for the deployed hosts', () => {
        expect(isTrustedExternalRedirect('http://notis.opencouncil.gr/admin')).toBe(false);
        expect(isTrustedExternalRedirect('http://notis-pr-632.opencouncil.dev/')).toBe(false);
    });

    it('rejects garbage', () => {
        expect(isTrustedExternalRedirect('not a url')).toBe(false);
        expect(isTrustedExternalRedirect('javascript:alert(1)')).toBe(false);
    });
});
