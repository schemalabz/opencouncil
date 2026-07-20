import { realmForHost, isKnownRealmHost } from '../realm';

describe('realmForHost', () => {
    it('resolves the cypriot apex domain', () => {
        expect(realmForHost('opencouncil.cy')).toBe('cyprus');
    });

    it('resolves cypriot subdomains, like preview hosts, to cyprus', () => {
        expect(realmForHost('pr-7.preview.opencouncil.cy')).toBe('cyprus');
    });
});

describe('isKnownRealmHost', () => {
    it('accepts cypriot hosts', () => {
        expect(isKnownRealmHost('opencouncil.cy')).toBe(true);
    });
});
