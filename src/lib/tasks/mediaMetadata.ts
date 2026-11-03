import * as z from 'zod';
import { readMediaFailureEnvelope } from './taskResponse';
import type { MediaFailure, MediaSourceInfo, InspectMediaResponse } from '@/lib/apiTypes';
import { webUrl } from '@/lib/zod-schemas/primitives';

const sensitiveQueryKeys = new Set([
    'keypairid', 'token', 'accesstoken', 'authtoken', 'auth', 'authorization', 'signature', 'sig', 'key', 'apikey',
    'password', 'passwd', 'credential', 'credentials', 'h', 'hash', 'jwt', 'bearer', 'policy',
    'expires', 'expiry', 'session', 'sessionid', 'secret', 'clientsecret', 'oauthtoken',
    'awsaccesskeyid', 'googleaccessid', 'hdnts', 'hdnea', 'authkey', 'securitytoken', 'cookie',
]);

// Public identifiers such as YouTube's v survive; credentials never belong in task metadata.
const mediaUrl = webUrl().max(16384).transform(value => {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
        const normalized = key.toLowerCase().replace(/[-_]/g, '');
        if (sensitiveQueryKeys.has(normalized) || /token|password|passwd|secret|credential|signature|(^|[-_])sig($|[-_])/i.test(key)
            || normalized.startsWith('xamz') || normalized.startsWith('xgoog')) {
            url.searchParams.delete(key);
        }
    }
    return url.toString();
});

export function sanitizeMediaErrorText(message: string): string {
    return message.replace(/https?:\/\/[^\s"'<>]+/gi, value => {
        try { return new URL(value).origin; }
        catch { return '[redacted media URL]'; }
    });
}

// Provider prose is informational: truncate it instead of losing the support/retry verdict.
const text = z.string().transform(value => value.slice(0, 4096));
export const mediaFailureSchema = z.object({
    reason: z.enum(['unsupported', 'playlist', 'embed_only', 'login_required', 'drm', 'unavailable', 'not_found', 'error']),
    retryable: z.boolean(),
    hint: text.transform(sanitizeMediaErrorText).optional().catch(undefined),
}) satisfies z.ZodType<MediaFailure>;

export const mediaSourceSchema = z.object({
    kind: z.enum(['spaces', 'file', 'yt-dlp']),
    extractor: text.optional().catch(undefined),
    id: text.optional().catch(undefined),
    title: text.optional().catch(undefined),
    durationSeconds: z.number().finite().nonnegative().optional().catch(undefined),
    liveStatus: text.optional().catch(undefined),
    startedAt: z.iso.datetime({ offset: true }).optional().catch(undefined),
    uploader: text.optional().catch(undefined),
    webpageUrl: mediaUrl.optional().catch(undefined),
    thumbnailUrl: mediaUrl.optional().catch(undefined),
    chapters: z.array(z.object({
        title: text,
        startSeconds: z.number().finite().nonnegative(),
        endSeconds: z.number().finite().nonnegative(),
    }).refine(chapter => chapter.endSeconds >= chapter.startSeconds)).max(2000).optional().catch(undefined),
}) satisfies z.ZodType<MediaSourceInfo>;

export const inspectMediaResponseSchema = z.discriminatedUnion('supported', [
    z.object({ supported: z.literal(true), source: mediaSourceSchema }),
    mediaFailureSchema.extend({ supported: z.literal(false), message: text.transform(sanitizeMediaErrorText) }),
]) satisfies z.ZodType<InspectMediaResponse>;

export function parseMediaSource(value: unknown) {
    const result = mediaSourceSchema.safeParse(value);
    return result.success ? result.data : undefined;
}

export function parseMediaFailure(value: unknown) {
    const result = mediaFailureSchema.safeParse(value);
    return result.success ? result.data : undefined;
}


export { MEDIA_FAILURE_RESPONSE_KIND, MEDIA_FAILURE_RESPONSE_PREFIX, encodeMediaFailureResponse, hasReplayableTaskResponse } from './taskResponse';

export function readMediaFailureResponse(body: string | null): MediaFailure | undefined {
    const envelope = readMediaFailureEnvelope(body);
    return envelope ? parseMediaFailure(envelope.mediaFailure) : undefined;
}
