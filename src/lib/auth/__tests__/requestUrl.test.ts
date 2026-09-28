import { isBaseUrlHost, retargetUrl } from '../requestUrl';

describe('isBaseUrlHost', () => {
    it('matches the host the base URL names, whatever the case', () => {
        expect(isBaseUrlHost('opencouncil.gr', 'https://opencouncil.gr')).toBe(true);
        expect(isBaseUrlHost('OpenCouncil.GR', 'https://opencouncil.gr')).toBe(true);
        expect(isBaseUrlHost('localhost:3000', 'http://localhost:3000')).toBe(true);
    });

    it('counts the port, and rejects a missing host or an unparsable base', () => {
        expect(isBaseUrlHost('localhost:3001', 'http://localhost:3000')).toBe(false);
        expect(isBaseUrlHost('opencouncil.rs', 'https://opencouncil.gr')).toBe(false);
        expect(isBaseUrlHost(null, 'https://opencouncil.gr')).toBe(false);
        expect(isBaseUrlHost('opencouncil.gr', 'not a url')).toBe(false);
    });
});

describe('retargetUrl', () => {
    it('moves the URL onto the host and drops the old port', () => {
        const url = retargetUrl(new URL('http://localhost:3000/api/auth/signin/google?x=1'), 'opencouncil.rs', null);
        expect(url.toString()).toBe('http://opencouncil.rs/api/auth/signin/google?x=1');
    });

    it('keeps a port the host names', () => {
        const url = retargetUrl(new URL('http://localhost:3000/a'), 'localhost:3001', null);
        expect(url.toString()).toBe('http://localhost:3001/a');
    });

    it('upgrades to https on a forwarded https and never downgrades', () => {
        expect(retargetUrl(new URL('http://localhost:3000/a'), 'opencouncil.fr', 'https').toString()).toBe('https://opencouncil.fr/a');
        expect(retargetUrl(new URL('https://opencouncil.gr/a'), 'opencouncil.fr', 'http').toString()).toBe('https://opencouncil.fr/a');
        expect(retargetUrl(new URL('https://opencouncil.gr/a'), 'opencouncil.fr', null).toString()).toBe('https://opencouncil.fr/a');
    });
});
