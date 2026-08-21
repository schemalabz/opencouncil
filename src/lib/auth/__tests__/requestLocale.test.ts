import { localeForRequest } from '../requestLocale';

const reqWith = (headers: Record<string, string>) =>
    new Request('https://internal.local/api/auth/signin', { headers });

describe('localeForRequest', () => {
    it('writes Serbian for a sign-in that started on opencouncil.rs', () => {
        expect(localeForRequest(reqWith({ host: 'opencouncil.rs' }))).toBe('sr');
    });

    it('writes French for opencouncil.fr', () => {
        expect(localeForRequest(reqWith({ host: 'opencouncil.fr' }))).toBe('fr');
    });

    it('falls back to Greek for the Greek domain and for unknown hosts', () => {
        expect(localeForRequest(reqWith({ host: 'opencouncil.gr' }))).toBe('el');
        expect(localeForRequest(reqWith({ host: 'localhost:3000' }))).toBe('el');
        expect(localeForRequest(reqWith({}))).toBe('el');
    });

    it('prefers x-forwarded-host over host (behind a proxy/LB)', () => {
        expect(
            localeForRequest(reqWith({ host: 'internal.local:8080', 'x-forwarded-host': 'opencouncil.rs' }))
        ).toBe('sr');
    });

    it('honors the reader’s Serbian script choice', () => {
        expect(localeForRequest(reqWith({ host: 'opencouncil.rs', cookie: 'oc-script=latn' }))).toBe('sr-Latn');
        expect(localeForRequest(reqWith({ host: 'opencouncil.rs', cookie: 'oc-script=cyrl' }))).toBe('sr');
    });

    it('reads the script cookie from a multi-cookie header', () => {
        expect(
            localeForRequest(
                reqWith({ host: 'opencouncil.rs', cookie: 'authjs.session-token=abc; oc-script=latn; other=1' })
            )
        ).toBe('sr-Latn');
    });

    it('honors a realm override on a preview host, so previews send the real email', () => {
        expect(
            localeForRequest(reqWith({ host: 'pr-7.opencouncil.dev', cookie: 'oc-realm=serbia' }))
        ).toBe('sr');
    });

    it('ignores a realm override on a production apex host', () => {
        expect(localeForRequest(reqWith({ host: 'opencouncil.gr', cookie: 'oc-realm=serbia' }))).toBe('el');
    });
});
