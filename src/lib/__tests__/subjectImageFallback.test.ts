import { subjectImageFallbackSvg } from '../subjectImageFallback';
import { topicStyleHex } from '../topicStyle';

describe('subjectImageFallbackSvg', () => {
    it('draws a 1344×768 wash of the topic colour with the topic icon', () => {
        const svg = subjectImageFallbackSvg({ colorHex: '#2a9d8f', icon: 'badge-check' });
        const style = topicStyleHex('#2a9d8f');
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768"')).toBe(true);
        expect(svg).toContain(`fill="${style.background}"`);
        expect(svg).toContain(`stroke="${style.icon}"`);
        expect(svg).toContain('<path ');
    });

    it('falls back to the neutral colour and the hash glyph without a topic', () => {
        const svg = subjectImageFallbackSvg(null);
        const neutral = topicStyleHex(null);
        expect(svg).toContain(`fill="${neutral.background}"`);
        expect(svg).toContain('<line ');
    });

    it('uses the hash glyph for an icon name lucide does not know', () => {
        const known = subjectImageFallbackSvg({ colorHex: '#000000', icon: 'hash' });
        const unknown = subjectImageFallbackSvg({ colorHex: '#000000', icon: 'no-such-icon' });
        expect(unknown).toBe(known);
    });
});
