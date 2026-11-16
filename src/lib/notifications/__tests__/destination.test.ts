import { municipalityDestination } from '../destination';

describe('municipalityDestination', () => {
    it('returns the bare municipality path for the default locale or unadorned returnTo', () => {
        expect(municipalityDestination('chania')).toBe('/chania');
        expect(municipalityDestination('chania', '/chania/notifications')).toBe('/chania');
        expect(municipalityDestination('chania', '/chania/notifications?step=2')).toBe('/chania');
        expect(municipalityDestination('chania', '/el/chania/notifications')).toBe('/chania');
    });

    it('preserves the locale prefix from returnTo for supported non-default locales', () => {
        expect(municipalityDestination('chania', '/en/chania/notifications')).toBe('/en/chania');
        expect(municipalityDestination('nis', '/lat/nis/notifications')).toBe('/lat/nis');
        expect(municipalityDestination('nis', '/sr/nis/notifications')).toBe('/sr/nis');
        expect(municipalityDestination('chania', '/fr/chania/notifications')).toBe('/fr/chania');
    });

    it('falls back safely when returnTo is not a relative path or carries an unsafe origin', () => {
        expect(municipalityDestination('athens', 'https://example.com/evil')).toBe('/athens');
        expect(municipalityDestination('athens', '//evil.com')).toBe('/athens');
        expect(municipalityDestination('athens', '/\\evil.com')).toBe('/athens');
    });

    it('sanitizes cityId with encodeURIComponent', () => {
        expect(municipalityDestination('chania', '/en/chania/notifications')).toBe('/en/chania');
        expect(municipalityDestination('test-city_1', '/lat/test-city_1/notifications')).toBe('/lat/test-city_1');
    });
});
