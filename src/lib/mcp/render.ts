import type { AspectRatio, GenerateHighlightRequest } from '@/lib/apiTypes';
import type { GenerateHighlightOptions } from '@/lib/tasks/generateHighlight-core';

/**
 * The render settings an agent can choose for a highlight video — the same
 * three the website's highlight dialog offers. Pure module (no prisma) so the
 * defaulting and comparison logic is unit-testable on its own.
 */
export type HighlightRenderOptions = {
    aspectRatio: AspectRatio;
    includeCaptions: boolean;
    includeSpeakerOverlay: boolean;
};

/**
 * Match HighlightPreviewDialog's defaults, so a clip an agent renders looks
 * like one a person renders. (Leaving the booleans unset would hand the task
 * API an `undefined` and produce a barer clip than the site ever makes.)
 */
export const DEFAULT_RENDER_OPTIONS: HighlightRenderOptions = {
    aspectRatio: 'default',
    includeCaptions: true,
    includeSpeakerOverlay: true,
};

function definedOnly(options?: Partial<HighlightRenderOptions>): Partial<HighlightRenderOptions> {
    if (!options) return {};
    return Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined)
    ) as Partial<HighlightRenderOptions>;
}

/** Fill in the defaults for whatever the caller left out. */
export function resolveRenderOptions(options?: Partial<HighlightRenderOptions>): HighlightRenderOptions {
    return { ...DEFAULT_RENDER_OPTIONS, ...definedOnly(options) };
}

/**
 * Build the task-API render payload. Vertical exports carry the same social
 * framing the web UI applies (blurred margins, no extra zoom).
 */
export function toGenerateOptions(options: HighlightRenderOptions): GenerateHighlightOptions {
    return {
        includeCaptions: options.includeCaptions,
        includeSpeakerOverlay: options.includeSpeakerOverlay,
        aspectRatio: options.aspectRatio,
        ...(options.aspectRatio === 'social-9x16' && {
            socialOptions: { marginType: 'blur' as const, zoomFactor: 1.0 },
        }),
    };
}

/** The settings a past render used, read back from its stored task request. */
export function renderOptionsFromRequestBody(requestBody: string): HighlightRenderOptions | null {
    try {
        const body = JSON.parse(requestBody) as GenerateHighlightRequest;
        if (!body?.render) return null;
        return resolveRenderOptions({
            aspectRatio: body.render.aspectRatio,
            includeCaptions: body.render.includeCaptions,
            includeSpeakerOverlay: body.render.includeSpeakerOverlay,
        });
    } catch {
        return null;
    }
}

export function sameRenderOptions(a: HighlightRenderOptions, b: HighlightRenderOptions): boolean {
    return a.aspectRatio === b.aspectRatio
        && a.includeCaptions === b.includeCaptions
        && a.includeSpeakerOverlay === b.includeSpeakerOverlay;
}
