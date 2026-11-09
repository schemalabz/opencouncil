import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

/** What may name an object: cuids, and nothing that could leave the folder. */
const SUBJECT_ID = /^[A-Za-z0-9_-]+$/;

export function isSubjectImageId(subjectId: string): boolean {
    return SUBJECT_ID.test(subjectId);
}

/**
 * Only this module knows where a subject's image lives. The prefix names the
 * style (`subject-images/8bit`): a later restyle writes a sibling folder and
 * leaves these.
 *
 * The id is checked here and not only at the route, because this key is also
 * what an upload writes: `../../logo` must never become one.
 */
export function objectKey(subjectId: string, prefix: string): string {
    if (!isSubjectImageId(subjectId)) {
        throw new Error(`Not a subject image id: ${JSON.stringify(subjectId)}`);
    }
    return `${folder(prefix)}${subjectId}.webp`;
}

/** The prefix as the folder its objects sit in: no leading slash, one trailing slash. */
function folder(prefix: string): string {
    return `${prefix.replace(/^\/+|\/+$/g, '')}/`;
}

export interface StoreDeps {
    client: S3Client;
    bucket: string;
    /** Folder inside the bucket, e.g. `subject-images/8bit`. */
    prefix: string;
}

export interface ResolveDeps extends Omit<StoreDeps, 'client'> {
    /**
     * Signs the lookup against the bucket. `null` asks the public URL instead,
     * which serves the same objects without a key: for a deployment without a
     * storage key, and for a folder this deployment only reads.
     */
    client: S3Client | null;
    /** Public origin the objects are served from, without a trailing slash (the CDN, or the bucket itself). */
    publicBaseUrl: string;
    /** The unsigned lookup's HTTP client; tests pass a fake. */
    fetch?: typeof fetch;
}

/** An unsigned lookup that hangs must not hold up the page that asked. */
const PUBLIC_HEAD_TIMEOUT_MS = 5000;

export interface ResolvedImage {
    url: string;
}

type S3Error = { name?: string; $metadata?: { httpStatusCode?: number } };

function asS3Error(error: unknown): S3Error | null {
    return typeof error === 'object' && error !== null ? (error as S3Error) : null;
}

/**
 * The S3 errors that mean "no such object". HeadObject answers with no body,
 * so on that path the status is all there is to read; the names cover the
 * commands that do send one. A missing bucket also answers 404 to HeadObject
 * and cannot be told apart here; it surfaces at the PutObject, as NoSuchBucket.
 */
export function isS3NotFound(error: unknown): boolean {
    const e = asS3Error(error);
    return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * Look up a subject's image. `null` means "no image"; the caller picks the
 * fallback. The ETag rides along as a cache-buster, so a replaced image gets
 * a new URL and no CDN or browser cache keeps serving the old one.
 */
export async function resolve(subjectId: string, deps: ResolveDeps): Promise<ResolvedImage | null> {
    const key = objectKey(subjectId, deps.prefix);
    // A no-op for the ids the guard admits; it keeps the URL right if that pattern ever widens.
    const url = `${deps.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const etag = deps.client
        ? await signedETag(deps.client, deps.bucket, key)
        : await publicETag(url, deps.fetch ?? fetch);
    if (etag === null) return null;
    const version = etag?.replace(/^W\//, '').replace(/"/g, '');
    return { url: `${url}${version ? `?v=${encodeURIComponent(version)}` : ''}` };
}

/** The object's ETag from a signed HeadObject, `undefined` when it has none, `null` when there is no object. */
async function signedETag(client: S3Client, bucket: string, key: string): Promise<string | undefined | null> {
    try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return head.ETag;
    } catch (error) {
        if (isS3NotFound(error)) return null;
        // A key that may read and write objects but not list the bucket gets
        // 403, not 404, for an object that is not there. Read it as a miss, so
        // the feature works on such a key; a key that is wrong altogether then
        // fails at the PutObject, where the failure is alerted. Everything
        // else (301 for a wrong region, 5xx, no status for a network error) is
        // a bucket that cannot be read, and the caller must not draw against it.
        if (asS3Error(error)?.$metadata?.httpStatusCode === 403) return null;
        throw error;
    }
}

/**
 * The same answer from an unsigned HEAD on the public URL. The bucket does not
 * let the public list it, so Spaces answers 403, not 404, for an object that is
 * not there; both read as a miss. Any other status, a timeout and a network
 * error throw, as a bucket that cannot be read does on the signed path.
 *
 * The CDN in front of the bucket caches an object's answer for a year
 * (`immutable`), so a HEAD on the bare URL would keep a replaced object's old
 * ETag. A query that no one has asked before makes the CDN ask the bucket.
 * A redirect is not followed: it throws below, as a wrong origin should.
 */
async function publicETag(url: string, fetchImpl: typeof fetch): Promise<string | undefined | null> {
    let response: Response;
    try {
        response = await fetchImpl(`${url}?lookup=${crypto.randomUUID()}`, {
            method: 'HEAD',
            cache: 'no-store',
            redirect: 'manual',
            signal: AbortSignal.timeout(PUBLIC_HEAD_TIMEOUT_MS),
        });
    } catch (error) {
        // fetch says only "fetch failed" and keeps the reason (DNS, refused, timeout) in `cause`; the alert shows the message.
        // A refused connection is an AggregateError with an empty message; its code says why.
        const cause = error instanceof Error ? error.cause : undefined;
        const reason = cause instanceof Error ? cause.message || (cause as { code?: string }).code || String(cause) : String(error);
        throw new Error(`HEAD ${url} failed: ${reason}`, { cause: error });
    }
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new Error(`HEAD ${url} answered ${response.status}`);
    return response.headers.get('etag') ?? undefined;
}

/** The subjects that have an object under the prefix: one request per 1,000 keys. */
export async function listStoredSubjectIds(deps: StoreDeps): Promise<Set<string>> {
    const prefix = folder(deps.prefix);
    const ids = new Set<string>();
    let token: string | undefined;
    do {
        const page = await deps.client.send(new ListObjectsV2Command({ Bucket: deps.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const object of page.Contents ?? []) {
            const id = object.Key?.slice(prefix.length).replace(/\.webp$/, '');
            if (id && isSubjectImageId(id) && object.Key !== `${prefix}${id}`) ids.add(id);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return ids;
}

/** Write the subject's image. Overwrites whatever was there. */
export async function store(subjectId: string, image: Buffer, deps: StoreDeps): Promise<void> {
    await deps.client.send(new PutObjectCommand({
        Bucket: deps.bucket,
        Key: objectKey(subjectId, deps.prefix),
        Body: image,
        ContentType: 'image/webp',
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
    }));
}
