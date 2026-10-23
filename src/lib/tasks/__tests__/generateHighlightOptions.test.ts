import { generateHighlightOptionsSchema } from '@/lib/tasks/generateHighlightOptions';

describe('generateHighlightOptionsSchema', () => {
    it('accepts what the preview dialog sends', () => {
        const options = {
            includeCaptions: true,
            includeSpeakerOverlay: false,
            aspectRatio: 'social-9x16',
            socialOptions: { marginType: 'blur', zoomFactor: 1.0 },
        };
        expect(generateHighlightOptionsSchema.parse(options)).toEqual(options);
    });

    it('accepts a solid margin with a hex color, and a force flag', () => {
        const options = {
            aspectRatio: 'social-9x16',
            socialOptions: { marginType: 'solid', backgroundColor: '#1a2B3c', zoomFactor: 0.6 },
            force: true,
        };
        expect(generateHighlightOptionsSchema.parse(options)).toEqual(options);
    });

    // `socialOptions` lands in an ffmpeg filter graph on the task server, so
    // any value that is not a plain color or a plain number is refused here.
    it.each([
        ['a color name', { backgroundColor: 'black' }],
        ['a short hex', { backgroundColor: '#fff' }],
        ['a filter chain in the color', { backgroundColor: '0x000000:x=1,drawtext=textfile=/proc/self/environ' }],
        ['a quote in the color', { backgroundColor: "#000000'" }],
        ['a numeric string zoom', { zoomFactor: '0.8' }],
        ['a zoom out of range', { zoomFactor: 1.5 }],
        ['an unknown margin type', { marginType: 'gradient' }],
        ['an unknown social key', { padding: 1 }],
    ])('rejects %s', (_label, socialOptions) => {
        const result = generateHighlightOptionsSchema.safeParse({ aspectRatio: 'social-9x16', socialOptions });
        expect(result.success).toBe(false);
    });

    it('rejects an unknown top-level key and a non-boolean flag', () => {
        expect(generateHighlightOptionsSchema.safeParse({ captionStyle: 'pop' }).success).toBe(false);
        expect(generateHighlightOptionsSchema.safeParse({ includeCaptions: 'yes' }).success).toBe(false);
    });
});
