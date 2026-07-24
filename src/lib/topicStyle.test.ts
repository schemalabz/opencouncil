import { contrastText, topicStyle } from './topicStyle';

const NEUTRAL = '#9ca3af';

describe('contrastText', () => {
    it('returns white on dark colours', () => {
        expect(contrastText('#000000')).toBe('#ffffff');
        expect(contrastText('#78350f')).toBe('#ffffff'); // a dark topic brown
    });

    it('returns near-black on light colours', () => {
        expect(contrastText('#ffffff')).toBe('#0c0a09');
        expect(contrastText('#eab308')).toBe('#0c0a09'); // Τουρισμός-ish yellow
    });

    it('treats mid grey (the NEUTRAL fallback) as light → dark text', () => {
        // luminance ≈ 0.636, just over the 0.62 cutoff
        expect(contrastText(NEUTRAL)).toBe('#0c0a09');
    });

    it('accepts a hex with or without the leading #', () => {
        expect(contrastText('eab308')).toBe(contrastText('#eab308'));
    });

    it('falls back to white on a too-short / malformed hex', () => {
        expect(contrastText('#fff')).toBe('#ffffff');
        expect(contrastText('')).toBe('#ffffff');
    });
});

describe('topicStyle', () => {
    it('solid is the topic at full strength with a readable icon', () => {
        expect(topicStyle('#eab308', 'solid')).toEqual({
            background: '#eab308',
            border: '#eab308',
            icon: '#0c0a09',
        });
    });

    it('soft washes the fill, rings in the topic, and darkens the icon', () => {
        expect(topicStyle('#eab308')).toEqual({
            background: 'color-mix(in srgb, #eab308 24%, white)',
            border: '#eab308',
            icon: 'color-mix(in srgb, #eab308 65%, black)',
        });
    });

    it('defaults to the soft variant', () => {
        expect(topicStyle('#eab308')).toEqual(topicStyle('#eab308', 'soft'));
    });

    it('falls back to NEUTRAL when the colour is null/undefined/empty', () => {
        const expected = topicStyle(NEUTRAL, 'soft');
        expect(topicStyle(null)).toEqual(expected);
        expect(topicStyle(undefined)).toEqual(expected);
        expect(topicStyle('')).toEqual(expected);
    });
});
