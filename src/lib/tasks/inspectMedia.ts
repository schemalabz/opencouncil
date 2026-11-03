import 'server-only';
import { env } from '@/env.mjs';
import type { InspectMediaRequest, InspectMediaResponse } from '@/lib/apiTypes';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { webUrl } from '@/lib/zod-schemas/primitives';
import { inspectMediaResponseSchema } from './mediaMetadata';

export async function inspectMedia(request: InspectMediaRequest): Promise<InspectMediaResponse> {
    const url = webUrl().safeParse(request.url);
    if (!url.success) throw new BadRequestError('Media URL must be a valid HTTP or HTTPS URL.');
    try {
        const response = await fetch(`${env.TASK_API_URL}/inspectMedia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TASK_API_KEY}` },
            body: JSON.stringify({ url: url.data }),
            signal: AbortSignal.timeout(150_000),
            cache: 'no-store',
        });
        if (!response.ok) throw new ApiError(502, `Media inspection failed (HTTP ${response.status}). Try again later.`);
        const result = inspectMediaResponseSchema.safeParse(await response.json());
        if (!result.success) throw new ApiError(502, 'Media inspection returned an invalid response. Try again later.');
        return result.data;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (typeof error === 'object' && error !== null && 'name' in error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
            throw new ApiError(504, 'Media inspection timed out. Try again later; support for this URL is still unknown.');
        }
        throw new ApiError(502, 'Media inspection is temporarily unavailable. Try again later; support for this URL is still unknown.');
    }
}
