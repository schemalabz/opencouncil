import { realmPageUrl } from '../realmPageUrl';

describe('realmPageUrl', () => {
    it('keeps the language of the viewer on the realm host', () => {
        expect(realmPageUrl('https://opencouncil.gr', 'en', '/athens/m1')).toBe('https://opencouncil.gr/en/athens/m1');
        expect(realmPageUrl('https://opencouncil.rs', 'sr-Latn', '/nis')).toBe('https://opencouncil.rs/lat/nis');
    });

    it('adds no prefix for the default locale', () => {
        expect(realmPageUrl('https://opencouncil.gr', 'el', '/athens')).toBe('https://opencouncil.gr/athens');
    });
});
