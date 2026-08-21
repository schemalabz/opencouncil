/**
 * @jest-environment node
 */
import { buildOgImageUrl, resolveOgLocale } from '../locale';

describe('resolveOgLocale', () => {
    it('honours the locale the page passed', () => {
        expect(resolveOgLocale('en', 'greece')).toBe('en');
        expect(resolveOgLocale('sr-Latn', 'serbia')).toBe('sr-Latn');
    });

    it('falls back to the realm default when the parameter is missing', () => {
        expect(resolveOgLocale(null, 'greece')).toBe('el');
        expect(resolveOgLocale(null, 'france')).toBe('fr');
        expect(resolveOgLocale(null, 'serbia')).toBe('sr');
        expect(resolveOgLocale(null, 'cyprus')).toBe('el');
    });

    it('falls back to the realm default when the parameter is not a locale', () => {
        expect(resolveOgLocale('de', 'france')).toBe('fr');
        expect(resolveOgLocale('', 'serbia')).toBe('sr');
        // The value reaches us straight from the query string, so it is untrusted.
        expect(resolveOgLocale('constructor', 'france')).toBe('fr');
    });
});

describe('buildOgImageUrl', () => {
    it('appends the locale to the image parameters', () => {
        expect(buildOgImageUrl('fr', { cityId: 'paris' })).toBe('/api/og?cityId=paris&locale=fr');
    });

    it('escapes parameter values', () => {
        expect(buildOgImageUrl('sr-Latn', { pageType: 'people', cityId: 'novi sad' })).toBe(
            '/api/og?pageType=people&cityId=novi+sad&locale=sr-Latn',
        );
    });
});
