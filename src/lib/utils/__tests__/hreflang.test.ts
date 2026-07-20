import { buildCanonicalAlternates } from '../hreflang';

let currentHost: string;

jest.mock('next/headers', () => ({
    headers: async () => new Headers({ host: currentHost }),
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

    it('resolves preview subdomains to their realm', async () => {
        currentHost = 'pr-7.preview.opencouncil.fr';
        expect(await buildCanonicalAlternates('/x')).toEqual({
            canonical: 'https://opencouncil.fr/x',
        });
    });
});
