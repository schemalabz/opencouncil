import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

/**
 * Only this module knows where a subject's image lives. The prefix names the
 * style (`subject-images/8bit`): a later restyle writes a sibling folder and
 * leaves these.
 */
export function objectKey(subjectId: string, prefix: string): string {
    return `${prefix.replace(/\/+$/, '')}/${subjectId}.webp`;
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

function isNotFound(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
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
        const url = `${deps.publicBaseUrl}/${key}${version ? `?v=${version}` : ''}`;
        return { url };
    } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
    }
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
