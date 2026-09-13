import 'server-only';
import type { ReactElement } from 'react';
import { ImageResponse } from 'next/og';
import { getOgConcurrencyStats, tryAcquireOgSlot } from './concurrency';

type ImageOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>;

/**
 * Render an image inside the OG concurrency slot, as `/api/og` does. An
 * ImageResponse renders when its body is read, so the bytes are read here,
 * inside the slot: the cap then bounds the satori work, not the handler
 * count. At capacity the answer is 429, and the crawler tries again.
 */
export async function renderImage(element: ReactElement, options: ImageOptions): Promise<Response> {
    const slot = tryAcquireOgSlot();
    if (!slot) {
        const stats = getOgConcurrencyStats();
        console.warn(`[og] 429 capacity ${stats.active}/${stats.max}`);
        return new Response('Image generator at capacity, try again shortly.', {
            status: 429,
            headers: { 'Retry-After': '5', 'Cache-Control': 'private, no-store' },
        });
    }
    try {
        const image = new ImageResponse(element, options);
        return new Response(await image.arrayBuffer(), { status: 200, headers: image.headers });
    } finally {
        slot.release();
    }
}

/**
 * How long a public image may be cached. A week for one with every picture in
 * place: a picture an admin replaces reaches the unfurl within the week. An
 * hour for one drawn while a picture it wanted was still being generated, or
 * for a subject that was not found: the picture arrives within minutes of the
 * meeting's processing.
 */
export function ogCacheControl(settled: boolean): string {
    if (process.env.NODE_ENV === 'development') return 'no-cache, no-store';
    return settled ? 'public, no-transform, max-age=604800' : 'public, no-transform, max-age=3600';
}

/**
 * The cache policy of a shared-content image (excerpt, contribution, story).
 * Its content depends on the URL and the review status only, so ten minutes
 * spares the render on every view and still shows a review within minutes.
 */
export function shareCacheControl(): string {
    return process.env.NODE_ENV === 'development' ? 'no-cache, no-store' : 'public, max-age=600';
}
