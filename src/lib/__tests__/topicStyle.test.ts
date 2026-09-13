import { contrastText, topicStyle, topicStyleHex } from '../topicStyle';

describe('topicStyleHex', () => {
    it('resolves the soft recipe to plain hex for renderers without color-mix', () => {
        // 24% of the topic over white, the topic itself as the ring, 65% of the topic over black as the ink.
        expect(topicStyleHex('#4f46e5')).toEqual({ background: '#d5d3f9', border: '#4f46e5', icon: '#332e95' });
        expect(topicStyleHex('#F44336')).toEqual({ background: '#fcd2cf', border: '#F44336', icon: '#9f2c23' });
    });

    it('falls back to the neutral grey for a missing or malformed colour', () => {
        expect(topicStyleHex(null)).toEqual(topicStyleHex('#9ca3af'));
        expect(topicStyleHex('#abc')).toEqual(topicStyleHex('#9ca3af'));
    });

    it('keeps the ring the same colour as the css recipe', () => {
        expect(topicStyleHex('#04a79b').border).toBe(topicStyle('#04a79b').border);
    });
});

describe('contrastText', () => {
    it('picks black on a light topic and white on a dark one', () => {
        expect(contrastText('#d3d926')).toBe('#0c0a09');
        expect(contrastText('#4f46e5')).toBe('#ffffff');
    });
});
