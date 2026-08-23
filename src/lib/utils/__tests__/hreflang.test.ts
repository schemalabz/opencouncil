import { buildCanonicalAlternates } from '../hreflang';

let currentHost: string;

jest.mock('next/headers', () => ({
    headers: async () => new Headers({ host: currentHost }),
    // getRealm() also consults the realm-override cookie; no override here.
    cookies: async () => ({ get: () => undefined }),
}));

describe('buildCanonicalAlternates', () => {
    it('canonicalizes to the unprefixed greece URL on the .gr host', async () => {
        currentHost = 'opencouncil.gr';
        expect(await buildCanonicalAlternates('/athens')).toEqual({
            canonical: 'https://opencouncil.gr/athens',
        });
    });

    it('canonicalizes to the .fr base URL on the french host', async () => {
        currentHost = 'opencouncil.fr';
        expect(await buildCanonicalAlternates('/lyon')).toEqual({
            canonical: 'https://opencouncil.fr/lyon',
        });
    });

    it('returns the bare base URL for the homepage', async () => {
        currentHost = 'opencouncil.gr';
        expect(await buildCanonicalAlternates('')).toEqual({
            canonical: 'https://opencouncil.gr',
        });
    });

    it('defaults unknown hosts to the greece realm', async () => {
        currentHost = 'localhost:3000';
        expect(await buildCanonicalAlternates('/athens')).toEqual({
            canonical: 'https://opencouncil.gr/athens',
        });
    });

    it('resolves realm subdomains to their realm', async () => {
        currentHost = 'www.opencouncil.fr';
        expect(await buildCanonicalAlternates('/x')).toEqual({
            canonical: 'https://opencouncil.fr/x',
        });
    });

    // A preview must never canonicalize to itself — the whole point of the
    // canonical is to point crawlers at the production page.
    it('canonicalizes a preview host to the production apex', async () => {
        currentHost = 'pr-7.opencouncil.dev';
        expect(await buildCanonicalAlternates('/x')).toEqual({
            canonical: 'https://opencouncil.gr/x',
        });
    });
});
