import { buildImageTag, validateImageFile, MAX_IMAGE_BYTES } from './imageTag';

describe('buildImageTag', () => {
    it('clamps a wide image to the 600px content width', () => {
        expect(buildImageTag('https://cdn/a.png', 4000)).toBe(
            '<img src="https://cdn/a.png" alt="" width="600" style="max-width:100%;height:auto;display:block;">',
        );
    });

    it('keeps the natural width for a narrow image', () => {
        expect(buildImageTag('https://cdn/a.png', 320)).toContain('width="320"');
    });

    it('falls back to the content width when the natural width is unknown', () => {
        expect(buildImageTag('https://cdn/a.png', 0)).toContain('width="600"');
    });

    it('escapes & and " in the URL so the src attribute cannot break', () => {
        expect(buildImageTag('https://cdn/a"b&c.png', 100)).toContain(
            'src="https://cdn/a&quot;b&amp;c.png"',
        );
    });
});

describe('validateImageFile', () => {
    it('accepts a PNG under the size cap', () => {
        expect(validateImageFile({ type: 'image/png', size: 1000 })).toEqual({ ok: true });
    });

    it('rejects a WebP', () => {
        expect(validateImageFile({ type: 'image/webp', size: 1000 }).ok).toBe(false);
    });

    it('rejects an oversized image', () => {
        expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }).ok).toBe(false);
    });
});
