import type { MediaFailure } from '@/lib/apiTypes';

export const MEDIA_FAILURE_RESPONSE_KIND = 'media-source-failure-v1';
// Canonical first field; the prefix has no SQL LIKE wildcards.
export const MEDIA_FAILURE_RESPONSE_PREFIX = '{"$opencouncilTaskResponse":"media-source-failure-v1",';

export function encodeMediaFailureResponse(failure: MediaFailure): string {
    return JSON.stringify({ $opencouncilTaskResponse: MEDIA_FAILURE_RESPONSE_KIND, mediaFailure: failure });
}

export function readMediaFailureEnvelope(body: string | null): { mediaFailure: unknown } | undefined {
    if (!body || body.length > 32768) return undefined;
    try {
        const value: unknown = JSON.parse(body);
        if (typeof value !== 'object' || value === null || !('$opencouncilTaskResponse' in value)
            || value.$opencouncilTaskResponse !== MEDIA_FAILURE_RESPONSE_KIND || !('mediaFailure' in value)) return undefined;
        return { mediaFailure: value.mediaFailure };
    } catch { return undefined; }
}

export function hasReplayableTaskResponse(body: string | null): boolean {
    if (body === null) return false;
    try {
        const value: unknown = JSON.parse(body);
        return !(typeof value === 'object' && value !== null && '$opencouncilTaskResponse' in value);
    } catch { return false; }
}
