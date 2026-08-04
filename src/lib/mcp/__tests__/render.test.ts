/** @jest-environment node */
import {
    DEFAULT_RENDER_OPTIONS,
    renderOptionsFromRequestBody,
    resolveRenderOptions,
    sameRenderOptions,
    toGenerateOptions,
} from '../render';

describe('resolveRenderOptions', () => {
    it('defaults to landscape with subtitles and speaker overlays, matching the web UI', () => {
        expect(resolveRenderOptions()).toEqual({
            aspectRatio: 'default',
            includeCaptions: true,
            includeSpeakerOverlay: true,
        });
    });

    it('applies partial overrides', () => {
        expect(resolveRenderOptions({ aspectRatio: 'social-9x16' })).toEqual({
            ...DEFAULT_RENDER_OPTIONS,
            aspectRatio: 'social-9x16',
        });
        expect(resolveRenderOptions({ includeCaptions: false })).toEqual({
            ...DEFAULT_RENDER_OPTIONS,
            includeCaptions: false,
        });
    });

    it('does not let explicit undefined clobber a default', () => {
        expect(resolveRenderOptions({ includeCaptions: undefined })).toEqual(DEFAULT_RENDER_OPTIONS);
    });
});

describe('toGenerateOptions', () => {
    it('passes the three settings through', () => {
        expect(toGenerateOptions({
            aspectRatio: 'default',
            includeCaptions: false,
            includeSpeakerOverlay: true,
        })).toEqual({
            aspectRatio: 'default',
            includeCaptions: false,
            includeSpeakerOverlay: true,
        });
    });

    it('attaches the UI\'s social framing only for vertical renders', () => {
        const social = toGenerateOptions({
            aspectRatio: 'social-9x16',
            includeCaptions: true,
            includeSpeakerOverlay: true,
        });
        expect(social.socialOptions).toEqual({ marginType: 'blur', zoomFactor: 1.0 });

        expect(toGenerateOptions(DEFAULT_RENDER_OPTIONS).socialOptions).toBeUndefined();
    });
});

describe('renderOptionsFromRequestBody', () => {
    it('reads back what a render was asked for', () => {
        const options = {
            aspectRatio: 'social-9x16' as const,
            includeCaptions: false,
            includeSpeakerOverlay: true,
        };
        const requestBody = JSON.stringify({ render: toGenerateOptions(options) });

        expect(renderOptionsFromRequestBody(requestBody)).toEqual(options);
    });

    it('returns null for malformed or render-less bodies', () => {
        expect(renderOptionsFromRequestBody('not json')).toBeNull();
        expect(renderOptionsFromRequestBody(JSON.stringify({ parts: [] }))).toBeNull();
    });
});

describe('sameRenderOptions', () => {
    it('compares every setting', () => {
        expect(sameRenderOptions(DEFAULT_RENDER_OPTIONS, { ...DEFAULT_RENDER_OPTIONS })).toBe(true);
        expect(sameRenderOptions(DEFAULT_RENDER_OPTIONS, {
            ...DEFAULT_RENDER_OPTIONS,
            aspectRatio: 'social-9x16',
        })).toBe(false);
        expect(sameRenderOptions(DEFAULT_RENDER_OPTIONS, {
            ...DEFAULT_RENDER_OPTIONS,
            includeCaptions: false,
        })).toBe(false);
        expect(sameRenderOptions(DEFAULT_RENDER_OPTIONS, {
            ...DEFAULT_RENDER_OPTIONS,
            includeSpeakerOverlay: false,
        })).toBe(false);
    });
});
