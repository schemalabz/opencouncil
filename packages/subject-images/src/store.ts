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

export interface ResolveDeps extends StoreDeps {
    /** Public origin the objects are served from, without a trailing slash (the CDN, or the bucket itself). */
    publicBaseUrl: string;
}

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
    try {
        const key = objectKey(subjectId, deps.prefix);
        const head = await deps.client.send(new HeadObjectCommand({ Bucket: deps.bucket, Key: key }));
        const version = head.ETag?.replace(/"/g, '');
        // A no-op for the ids the guard admits; it keeps the URL right if that pattern ever widens.
        const path = key.split('/').map(encodeURIComponent).join('/');
        const url = `${deps.publicBaseUrl}/${path}${version ? `?v=${version}` : ''}`;
        return { url };
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
