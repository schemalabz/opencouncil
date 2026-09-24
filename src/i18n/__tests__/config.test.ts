import { stripLocalePrefix, localePathPrefix } from '@/i18n/config';

describe('stripLocalePrefix', () => {
    test('removes the custom prefix of sr-Latn', () => {
        expect(stripLocalePrefix('/lat/nis/parties/p1')).toBe('/nis/parties/p1');
    });

    test('removes a prefix that is a locale id', () => {
        expect(stripLocalePrefix('/en/chania')).toBe('/chania');
        expect(stripLocalePrefix('/fr/rennes/meetings/m1')).toBe('/rennes/meetings/m1');
    });

    test('removes a prefix that stands alone', () => {
        expect(stripLocalePrefix('/lat')).toBe('/');
        expect(stripLocalePrefix('/en')).toBe('/');
    });

    test('keeps a path that carries no prefix', () => {
        expect(stripLocalePrefix('/chania/parties/p1')).toBe('/chania/parties/p1');
        expect(stripLocalePrefix('/')).toBe('/');
    });

    test('removes one prefix only', () => {
        expect(stripLocalePrefix('/lat/lat/nis')).toBe('/lat/nis');
    });

    test('keeps a segment that only starts with a prefix', () => {
        expect(stripLocalePrefix('/latium/subjects')).toBe('/latium/subjects');
        expect(stripLocalePrefix('/english')).toBe('/english');
    });

    test('is the inverse of localePathPrefix', () => {
        for (const locale of ['el', 'en', 'fr', 'sr', 'sr-Latn']) {
            expect(stripLocalePrefix(`${localePathPrefix(locale)}/nis/parties/p1`)).toBe('/nis/parties/p1');
        }
    });
});
