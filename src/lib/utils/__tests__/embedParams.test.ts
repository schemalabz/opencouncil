import { parseEmbedConfig, parseBoundedInt, embedLocalePrefix, EMBED_SUMMARY_LIMITS } from '../embedParams';

describe('parseBoundedInt', () => {
    const spec = { default: 6, min: 1, max: 20 };

    it('falls back to the default for a missing, invalid or zero value', () => {
        expect(parseBoundedInt(undefined, spec)).toBe(6);
        expect(parseBoundedInt('abc', spec)).toBe(6);
        expect(parseBoundedInt('0', spec)).toBe(6);
    });

    it('clamps to the bounds', () => {
        expect(parseBoundedInt('3', spec)).toBe(3);
        expect(parseBoundedInt('99', spec)).toBe(20);
        expect(parseBoundedInt('-4', spec)).toBe(1);
    });
});

describe('parseEmbedConfig limit', () => {
    it('keeps the meetings and subjects widgets at default 5, cap 10', () => {
        expect(parseEmbedConfig({}).limit).toBe(5);
        expect(parseEmbedConfig({ limit: '50' }).limit).toBe(10);
    });

    it('uses the summary widget bounds when given', () => {
        expect(parseEmbedConfig({}, { limit: EMBED_SUMMARY_LIMITS.meetings }).limit).toBe(1);
        expect(parseEmbedConfig({ limit: '3' }, { limit: EMBED_SUMMARY_LIMITS.meetings }).limit).toBe(3);
        expect(parseEmbedConfig({ limit: '50' }, { limit: EMBED_SUMMARY_LIMITS.meetings }).limit).toBe(5);
    });
});

describe('embedLocalePrefix', () => {
    it('is empty for the default locale and a path segment otherwise', () => {
        expect(embedLocalePrefix('el')).toBe('');
        expect(embedLocalePrefix('en')).toBe('/en');
    });
});
