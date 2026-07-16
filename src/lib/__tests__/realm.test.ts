import { realmForHost, createRealmResolver, isKnownRealmHost } from '../realm';

describe('createRealmResolver', () => {
    // Parent declared first so a naive first-match would wrongly return it for
    // hosts on the child's domain — the ordering under test must not depend on
    // declaration order.
    const NESTED = {
        parent: { domain: 'example.org' },
        child: { domain: 'sub.example.org' },
    };
    const resolve = createRealmResolver(NESTED);

    it('resolves a host on a subdomain realm to that realm, not its parent', () => {
        expect(resolve('sub.example.org')).toBe('child');
    });

    it('resolves subdomains of a subdomain realm to that realm', () => {
        expect(resolve('pr-7.sub.example.org')).toBe('child');
    });

    it('resolves other subdomains of the parent domain to the parent realm', () => {
        expect(resolve('pr-7.preview.example.org')).toBe('parent');
    });

    it('does not match a label that merely ends with a subdomain realm label', () => {
        expect(resolve('notsub.example.org')).toBe('parent');
    });

    it('strips the port and lowercases the host', () => {
        expect(resolve('SUB.Example.ORG:443')).toBe('child');
    });

    it('returns null when no realm domain matches', () => {
        expect(resolve('unknown.com')).toBeNull();
        expect(resolve(null)).toBeNull();
    });
});

describe('realmForHost', () => {
    it('resolves the production apex domains', () => {
        expect(realmForHost('opencouncil.gr')).toBe('greece');
        expect(realmForHost('opencouncil.fr')).toBe('france');
        expect(realmForHost('opencouncil.cy')).toBe('cyprus');
    });

    it('resolves preview subdomains of a realm domain to that realm', () => {
        expect(realmForHost('pr-7.preview.opencouncil.gr')).toBe('greece');
        expect(realmForHost('pr-7.preview.opencouncil.fr')).toBe('france');
        expect(realmForHost('pr-7.preview.opencouncil.cy')).toBe('cyprus');
    });

    it.each([null, undefined, '', 'localhost:3000', 'example.com'])(
        'defaults %p to greece',
        (host) => {
            expect(realmForHost(host)).toBe('greece');
        },
    );
});

describe('isKnownRealmHost', () => {
    it('accepts apex and subdomain hosts of any realm domain', () => {
        expect(isKnownRealmHost('opencouncil.gr')).toBe(true);
        expect(isKnownRealmHost('opencouncil.fr')).toBe(true);
        expect(isKnownRealmHost('opencouncil.cy')).toBe(true);
        expect(isKnownRealmHost('pr-7.preview.opencouncil.fr')).toBe(true);
    });

    it('rejects unknown hosts', () => {
        expect(isKnownRealmHost('evil.com')).toBe(false);
        expect(isKnownRealmHost('localhost')).toBe(false);
        expect(isKnownRealmHost('')).toBe(false);
        expect(isKnownRealmHost(null)).toBe(false);
    });
});
