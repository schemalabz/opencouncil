import 'server-only';
import { decodableImageType } from '@opencouncil/subject-images/decode';
import { UnreadableImageError } from '@opencouncil/subject-images/image';
import { fetchImageBytes } from '@/lib/fetchImage';
import { constructPublicUrl, deleteFile, isStorageConfigured, uploadFile, type UploadResult } from '@/lib/s3';
import { env } from '@/env.mjs';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, STORED_IMAGE_KINDS, type StoredImageKind } from '@/lib/utils/imageUpload';
import { isPlainHttpsUrl, isStoredImageUrl } from '@/lib/utils/storedImageUrl';
import { errorMessage } from '@/lib/utils/errors';

/** An image URL that could not be copied into storage. `reason` says why, for the caller's error. */
export class RemoteImageError extends Error {
    constructor(readonly url: string, readonly reason: string) {
        super(`${url}: ${reason}`);
        this.name = 'RemoteImageError';
    }
}

const FETCH_TIMEOUT_MS = 15_000;
const MAY_PASS_LATER = ' (this may pass if you try again)';
// Failures of the connection, not of the link: a second call can pass. An
// unknown host (ENOTFOUND) or a bad certificate fails the same way each time.
const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

/** Why a fetch threw, with the retry hint when the failure is transient. */
function fetchFailure(error: unknown): string {
    if (error instanceof DOMException && error.name === 'TimeoutError') return `no answer within ${FETCH_TIMEOUT_MS / 1000} s${MAY_PASS_LATER}`;
    const cause = error instanceof Error ? error.cause : undefined;
    const causeMessage = cause instanceof Error ? cause.message : '';
    if (/redirect/i.test(causeMessage)) return 'it redirects; pass the URL it redirects to';
    const code = cause instanceof Error && 'code' in cause ? String(cause.code) : '';
    const failure = `could not be fetched (${errorMessage(error)}${causeMessage ? `: ${causeMessage}` : ''})`;
    return TRANSIENT_NETWORK_CODES.has(code) ? failure + MAY_PASS_LATER : failure;
}

/** Our storage refused to store a copy. Not the URL's fault. */
export class StoredImageWriteError extends Error {
    constructor(cause: unknown) {
        super(errorMessage(cause), { cause });
        this.name = 'StoredImageWriteError';
    }
}

/**
 * Why this deployment cannot store a copy that the site draws, or null when
 * it can: it has no storage keys, or its bucket is not on a host the site
 * draws from (a copy would not show either).
 */
export function imageStorageProblem(): string | null {
    if (!isStorageConfigured()) return 'this deployment has no storage keys (DO_SPACES_KEY, DO_SPACES_SECRET)';
    if (!isStoredImageUrl(constructPublicUrl(env.DO_SPACES_BUCKET, 'probe'))) {
        return `the bucket ${env.DO_SPACES_BUCKET} is not served from a host the site draws (src/lib/utils/storageHosts.cjs)`;
    }
    return null;
}

// The server fetches a URL that an administrator typed: a plain public https
// address only, never a credential, a port or a host on the server's own
// network. The check reads the name as written; a public name that resolves
// to a private address passes, which the superadmin-only callers accept.
function refusal(url: URL): string | null {
    if (!isPlainHttpsUrl(url)) return 'only https URLs without credentials or a port are copied';
    const host = url.hostname.replace(/\.$/, '');
    if (!host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
        || /^[\d.]+$/.test(host) || host.startsWith('[')) return 'the host must be a public domain name';
    return null;
}

/**
 * Copy an image from another host into the storage folder of its kind, and
 * return where it is stored. The image must decode in full within
 * MAX_IMAGE_PIXELS, and its real type must be one that the kind accepts. A URL
 * that is already on our storage is not copied.
 *
 * Throws RemoteImageError when the URL is refused, cannot be fetched, or is
 * not an image of an accepted type, and StoredImageWriteError when our
 * storage refuses the copy.
 */
export async function storeRemoteImage(rawUrl: string, kind: StoredImageKind): Promise<UploadResult | { url: string; key: null }> {
    if (isStoredImageUrl(rawUrl)) return { url: rawUrl, key: null };
    const { prefix, types } = STORED_IMAGE_KINDS[kind];
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new RemoteImageError(rawUrl, 'not a URL');
    }
    const refused = refusal(url);
    if (refused) throw new RemoteImageError(rawUrl, refused);

    let image;
    try {
        image = await fetchImageBytes(url.href, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
    } catch (error) {
        throw new RemoteImageError(rawUrl, fetchFailure(error));
    }
    if (!image.ok) {
        if (image.reason === 'status') {
            const transient = image.status === 429 || image.status >= 500;
            throw new RemoteImageError(rawUrl, `the host answered HTTP ${image.status}${transient ? MAY_PASS_LATER : ''}`);
        }
        // No 'type' refusal here: the type is read from the bytes, so no `types` is passed.
        throw new RemoteImageError(rawUrl, `larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    }

    let type;
    try {
        type = await decodableImageType(image.bytes, MAX_IMAGE_PIXELS);
    } catch (error) {
        if (error instanceof UnreadableImageError) throw new RemoteImageError(rawUrl, error.message);
        throw error;
    }
    if (!types.includes(type)) throw new RemoteImageError(rawUrl, `the file is ${type}; accepted: ${types.join(', ')}`);
    const extension = type.slice('image/'.length);
    try {
        return await uploadFile(new File([new Uint8Array(image.bytes)], `image.${extension}`, { type }), { prefix });
    } catch (error) {
        throw new StoredImageWriteError(error);
    }
}

/** Delete copies that storeRemoteImage made, when the write they were for did not happen. A failed delete is logged, not thrown. */
export async function deleteStoredImages(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => deleteFile(env.DO_SPACES_BUCKET, key).catch(error =>
        console.error(`[stored-images] could not delete ${key}:`, error))));
}
