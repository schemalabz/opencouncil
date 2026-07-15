import { wwwRedirectTarget } from '../seo-redirects';

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
