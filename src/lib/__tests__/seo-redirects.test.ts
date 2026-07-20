import { foreignLocaleRedirectPath, wwwRedirectTarget } from '../seo-redirects';
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
    it('returns the other realms\' default locales', () => {
        expect(foreignLocalesForRealm('greece')).toEqual(['fr']);
        expect(foreignLocalesForRealm('france')).toEqual(['el']);
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
});
