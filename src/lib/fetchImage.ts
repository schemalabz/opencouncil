import 'server-only';

export type FetchImageResult =
    | { ok: true; bytes: Buffer }
    | { ok: false; reason: 'status'; status: number }
    | { ok: false; reason: 'type' }
    | { ok: false; reason: 'tooLarge' };

export interface FetchImageOptions {
    maxBytes: number;
    timeoutMs: number;
    /** Refuse by the declared type before the body is read. Leave out when the caller reads the type from the bytes. */
    types?: readonly string[];
}

/**
 * Download a picture with a byte limit and a timeout, refusing redirects: a
 * caller checks the host before the request, and a redirect would lead past
 * that check. Every byte read is bounded: a declared length over the limit is
 * refused before the body, and the read stops at the limit when the length
 * is not declared or is wrong.
 *
 * A refused answer comes back with its reason. Network errors, a redirect
 * and the timeout throw.
 */
export async function fetchImageBytes(url: string, { maxBytes, timeoutMs, types }: FetchImageOptions): Promise<FetchImageResult> {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        return { ok: false, reason: 'status', status: response.status };
    }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const refused: FetchImageResult | null = types && (!contentType || !types.includes(contentType)) ? { ok: false, reason: 'type' }
        : Number(response.headers.get('content-length')) > maxBytes ? { ok: false, reason: 'tooLarge' }
        : null;
    if (refused) {
        await response.body.cancel();
        return refused;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) return { ok: false, reason: 'tooLarge' };
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    return { ok: true, bytes: Buffer.concat(chunks) };
}
