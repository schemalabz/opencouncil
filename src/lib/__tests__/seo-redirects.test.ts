import { foreignLocaleRedirectPath, serbianScriptAdoption, serbianScriptParamTarget, serbianScriptRedirectPath, wwwRedirectTarget } from '../seo-redirects';
import { computeForeignLocales, foreignLocalesForRealm } from '../realm';

describe('wwwRedirectTarget', () => {
    it('redirects www.opencouncil.gr to the apex, preserving path and query', () => {
        expect(wwwRedirectTarget('www.opencouncil.gr', '/athens', '?x=1'))
            .toBe('https://opencouncil.gr/athens?x=1');
    });

    it('redirects www.opencouncil.fr to the french apex', () => {
        expect(wwwRedirectTarget('www.opencouncil.fr', '/', ''))
            .toBe('https://opencouncil.fr/');
    });

    it('strips trailing slashes so the redirect is a single hop', () => {
        expect(wwwRedirectTarget('www.opencouncil.gr', '/athens/', '?x=1'))
            .toBe('https://opencouncil.gr/athens?x=1');
        expect(wwwRedirectTarget('www.opencouncil.gr', '/', ''))
            .toBe('https://opencouncil.gr/');
    });

    it('strips the port before matching', () => {
        expect(wwwRedirectTarget('www.opencouncil.gr:443', '/x', ''))
            .toBe('https://opencouncil.gr/x');
    });

    it('matches hosts case-insensitively', () => {
        expect(wwwRedirectTarget('WWW.OPENCOUNCIL.GR', '/athens', ''))
            .toBe('https://opencouncil.gr/athens');
    });

    it('leaves the apex domains alone', () => {
        expect(wwwRedirectTarget('opencouncil.gr', '/athens', '')).toBeNull();
    });

    it('leaves nested subdomains alone', () => {
        expect(wwwRedirectTarget('www.pr-7.preview.opencouncil.fr', '/x', '')).toBeNull();
        expect(wwwRedirectTarget('opencouncil.chania.gr', '/x', '')).toBeNull();
    });

    it('ignores unknown and missing hosts', () => {
        expect(wwwRedirectTarget('www.example.com', '/x', '')).toBeNull();
        expect(wwwRedirectTarget(null, '/x', '')).toBeNull();
        expect(wwwRedirectTarget(undefined, '/x', '')).toBeNull();
    });
});

describe('foreignLocalesForRealm', () => {
    it('returns the other realms\' locales', () => {
        expect(foreignLocalesForRealm('greece')).toEqual(['fr', 'sr', 'sr-Latn']);
        expect(foreignLocalesForRealm('france')).toEqual(['el', 'sr', 'sr-Latn']);
        expect(foreignLocalesForRealm('serbia')).toEqual(['el', 'fr']);
    });

    it('does not treat el as foreign on either el realm', () => {
        // greece and cyprus share el as their default locale.
        expect(foreignLocalesForRealm('cyprus')).toEqual(['fr', 'sr', 'sr-Latn']);
        expect(foreignLocalesForRealm('greece')).not.toContain('el');
    });
});

describe('computeForeignLocales', () => {
    it('never treats a realm\'s own default locale as foreign when another realm shares it', () => {
        const SHARED = {
            a: { defaultLocale: 'el' },
            b: { defaultLocale: 'fr' },
            c: { defaultLocale: 'el' },
        };
        expect(computeForeignLocales(SHARED)).toEqual({
            a: ['fr'],
            b: ['el'],
            c: ['fr'],
        });
    });
});

describe('foreignLocaleRedirectPath', () => {
    it('strips /fr on the greek host', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/fr/athens')).toBe('/athens');
    });

    it('redirects a bare foreign-locale path to the root', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/fr')).toBe('/');
    });

    it('strips /el on the french host', () => {
        expect(foreignLocaleRedirectPath('opencouncil.fr', '/el/lyon')).toBe('/lyon');
    });

    it('leaves the realm\'s own default prefix to next-intl', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/el/athens')).toBeNull();
        expect(foreignLocaleRedirectPath('opencouncil.cy', '/el/nicosia')).toBeNull();
    });

    it('strips /fr on the cypriot host', () => {
        expect(foreignLocaleRedirectPath('opencouncil.cy', '/fr/nicosia')).toBe('/nicosia');
    });

    it('leaves /en alone on both realms', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/en/athens')).toBeNull();
        expect(foreignLocaleRedirectPath('opencouncil.fr', '/en/lyon')).toBeNull();
    });

    it('does not touch unknown hosts, so localhost keeps all locales', () => {
        expect(foreignLocaleRedirectPath('localhost:3000', '/fr/athens')).toBeNull();
    });

    it('does not partial-match path segments starting with a locale', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/france')).toBeNull();
        // /el is the foreign prefix on the french host; a city id starting
        // with the same letters must not be mistaken for it.
        expect(foreignLocaleRedirectPath('opencouncil.fr', '/elefsina')).toBeNull();
    });

    it('applies on realm subdomains like preview hosts', () => {
        expect(foreignLocaleRedirectPath('pr-7.preview.opencouncil.gr', '/fr/athens')).toBe('/athens');
    });

    it('strips Serbian prefixes on non-Serbian hosts, using the /lat URL prefix for sr-Latn', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/sr/athens')).toBe('/athens');
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/lat/athens')).toBe('/athens');
        expect(foreignLocaleRedirectPath('opencouncil.fr', '/lat')).toBe('/');
        // The locale id must NOT be matched for a custom-prefixed locale.
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/sr-Latn/athens')).toBeNull();
    });

    it('strips el and fr on the serbian host but leaves its own locales alone', () => {
        expect(foreignLocaleRedirectPath('opencouncil.rs', '/el/beograd')).toBe('/beograd');
        expect(foreignLocaleRedirectPath('opencouncil.rs', '/fr/beograd')).toBe('/beograd');
        expect(foreignLocaleRedirectPath('opencouncil.rs', '/sr/beograd')).toBeNull();
        expect(foreignLocaleRedirectPath('opencouncil.rs', '/lat/beograd')).toBeNull();
        expect(foreignLocaleRedirectPath('opencouncil.rs', '/en/beograd')).toBeNull();
    });

    it('does not partial-match Serbian-looking path segments', () => {
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/srbija')).toBeNull();
        expect(foreignLocaleRedirectPath('opencouncil.gr', '/latinika')).toBeNull();
    });

    it('with a realm override, treats the host as that realm', () => {
        // Preview host (greece by Host) overridden to serbia: Serbian locales
        // become native, Greek becomes foreign — mirroring opencouncil.rs.
        expect(foreignLocaleRedirectPath('pr-7.preview.opencouncil.gr', '/lat/beograd', 'serbia')).toBeNull();
        expect(foreignLocaleRedirectPath('pr-7.preview.opencouncil.gr', '/el/beograd', 'serbia')).toBe('/beograd');
        // Even on unknown hosts (localhost) the override applies, so the
        // emulation is faithful in local dev too.
        expect(foreignLocaleRedirectPath('localhost:3000', '/el/beograd', 'serbia')).toBe('/beograd');
        expect(foreignLocaleRedirectPath('localhost:3000', '/lat/beograd', 'serbia')).toBeNull();
    });
});

describe('serbianScriptRedirectPath', () => {
    it('redirects unprefixed serbia-realm paths to /lat while the cookie says latn', () => {
        expect(serbianScriptRedirectPath('serbia', '/nis', 'latn')).toBe('/lat/nis');
        expect(serbianScriptRedirectPath('serbia', '/nis/mar17-2026', 'latn')).toBe('/lat/nis/mar17-2026');
        expect(serbianScriptRedirectPath('serbia', '/', 'latn')).toBe('/lat');
    });

    it('lets any explicit locale prefix win over the cookie', () => {
        expect(serbianScriptRedirectPath('serbia', '/lat/nis', 'latn')).toBeNull();
        expect(serbianScriptRedirectPath('serbia', '/lat', 'latn')).toBeNull();
        expect(serbianScriptRedirectPath('serbia', '/en/nis', 'latn')).toBeNull();
        expect(serbianScriptRedirectPath('serbia', '/sr/nis', 'latn')).toBeNull();
    });

    it('does nothing without a latn cookie', () => {
        expect(serbianScriptRedirectPath('serbia', '/nis', undefined)).toBeNull();
        expect(serbianScriptRedirectPath('serbia', '/nis', 'cyrl')).toBeNull();
        expect(serbianScriptRedirectPath('serbia', '/nis', 'garbage')).toBeNull();
    });

    it('does nothing outside the serbia realm', () => {
        expect(serbianScriptRedirectPath('greece', '/athens', 'latn')).toBeNull();
        expect(serbianScriptRedirectPath('france', '/paris', 'latn')).toBeNull();
    });

    it('does not partial-match path segments that merely start with lat', () => {
        expect(serbianScriptRedirectPath('serbia', '/latinika', 'latn')).toBe('/lat/latinika');
    });
});

describe('serbianScriptRedirectPath embed exemption', () => {
    it('never redirects embed routes, whose URL the embedding site chose', () => {
        expect(serbianScriptRedirectPath('serbia', '/embed/meetings', 'latn')).toBeNull();
        expect(serbianScriptRedirectPath('serbia', '/embed', 'latn')).toBeNull();
    });
});

describe('serbianScriptAdoption', () => {
    it('adopts latn when entering the /lat tree without it persisted', () => {
        expect(serbianScriptAdoption('serbia', '/lat/nis', undefined)).toBe('latn');
        expect(serbianScriptAdoption('serbia', '/lat', 'cyrl')).toBe('latn');
    });

    it('is a no-op when latn is already persisted', () => {
        expect(serbianScriptAdoption('serbia', '/lat/nis', 'latn')).toBeNull();
    });

    it('adopts nothing outside the /lat tree', () => {
        expect(serbianScriptAdoption('serbia', '/nis', undefined)).toBeNull();
        expect(serbianScriptAdoption('serbia', '/latinika', undefined)).toBeNull();
        expect(serbianScriptAdoption('serbia', '/en/nis', undefined)).toBeNull();
    });

    it('never lets an embed iframe set a site-wide preference', () => {
        expect(serbianScriptAdoption('serbia', '/lat/embed/meetings', undefined)).toBeNull();
        expect(serbianScriptAdoption('serbia', '/lat/embed', 'cyrl')).toBeNull();
    });

    it('does nothing outside the serbia realm', () => {
        expect(serbianScriptAdoption('greece', '/lat/nis', undefined)).toBeNull();
    });
});

describe('serbianScriptParamTarget', () => {
    it('strips the /lat prefix when the param asks for cyrl', () => {
        expect(serbianScriptParamTarget('/lat/nis', 'cyrl')).toBe('/nis');
        expect(serbianScriptParamTarget('/lat', 'cyrl')).toBe('/');
        expect(serbianScriptParamTarget('/nis', 'cyrl')).toBe('/nis');
    });

    it('enters the /lat tree in one hop when the param asks for latn', () => {
        expect(serbianScriptParamTarget('/nis', 'latn')).toBe('/lat/nis');
        expect(serbianScriptParamTarget('/', 'latn')).toBe('/lat');
        expect(serbianScriptParamTarget('/lat/nis', 'latn')).toBe('/lat/nis');
    });

    it('leaves explicit non-Serbian prefixes alone in both directions', () => {
        expect(serbianScriptParamTarget('/en/nis', 'latn')).toBe('/en/nis');
        expect(serbianScriptParamTarget('/en/nis', 'cyrl')).toBe('/en/nis');
    });

    it('does not partial-match segments that merely start with lat', () => {
        expect(serbianScriptParamTarget('/latinika', 'cyrl')).toBe('/latinika');
    });
});
