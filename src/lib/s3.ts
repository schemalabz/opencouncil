import {
    S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command, ObjectCannedACL,
    CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/env.mjs'
import { isS3NotFound } from '@opencouncil/subject-images/store'

/** The storage key pair, or null where the deployment has none (see crossVariableIssue in src/env.mjs). */
function storageCredentials() {
    return env.DO_SPACES_KEY && env.DO_SPACES_SECRET
        ? { accessKeyId: env.DO_SPACES_KEY, secretAccessKey: env.DO_SPACES_SECRET }
        : null
}

/** Whether this deployment can write to the bucket. Contributors get no key. */
export function isStorageConfigured(): boolean {
    return storageCredentials() !== null
}

// Global S3 client instance. Without a key, its credentials provider throws,
// so every request and every presigned URL fails at once and the server log
// names the keys, instead of a 403 from Spaces later (or, for a browser
// upload, a CORS error). A provider also keeps the SDK from searching its
// default chain (~/.aws, the instance metadata endpoint).
export const s3Client = new S3Client({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: 'fra-1',
    credentials: storageCredentials() ?? (async () => { throw new Error('Storage needs DO_SPACES_KEY and DO_SPACES_SECRET') }),
})

// Upload configuration types
export interface UploadOptions {
    bucket?: string
    prefix?: string
    acl?: ObjectCannedACL
    contentType?: string
    useCdn?: boolean
}

export interface UploadResult {
    url: string
    key: string
    filename: string
}
// Utility functions
export function extractFileExtension(filename: string): string {
    return filename.split('.').pop() || 'bin'
}

/** A key part keeps letters, digits, `_` and `-`: a part can be free text, and a `/` would move the file. */
const keyPart = (part: string) => part.replace(/[^A-Za-z0-9_-]+/g, '-')

/**
 * The key of every file that we store: `{prefix}/{part}_{part}_{random}.{ext}`,
 * or `{prefix}/{uuid}.{ext}` without parts. The parts keep the file
 * recognizable in the bucket. The random part makes each key new, so a file
 * never replaces another one and needs no lookup first. It also keeps the
 * task server, which caches a download by its file name, from reading an
 * older file under the same name.
 */
export function objectKey(prefix: string, parts: string[], extension: string): string {
    const name = parts.length > 0 ? `${parts.map(keyPart).join('_')}_${crypto.randomUUID().slice(0, 8)}` : crypto.randomUUID()
    return `${prefix}/${name}.${keyPart(extension).toLowerCase() || 'bin'}`
}

export function constructPublicUrl(bucket: string, key: string, useCdn: boolean = false): string {
    if (useCdn) {
        return `${env.CDN_URL}/${key}`
    }
    const endpoint = env.DO_SPACES_ENDPOINT?.replace('https://', '')
    return `https://${bucket}.${endpoint}/${key}`
}

// Main upload function
export async function uploadFile(
    file: File,
    options: UploadOptions = {}
): Promise<UploadResult> {
    const {
        bucket = env.DO_SPACES_BUCKET,
        prefix = 'uploads',
        acl = 'public-read' as ObjectCannedACL,
        contentType = file.type,
        useCdn = false
    } = options

    const key = objectKey(prefix, [], extractFileExtension(file.name))

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: bucket,
            Key: key,
            Body: Buffer.from(await file.arrayBuffer()),
            ACL: acl,
            ContentType: contentType,
        },
    })

    await upload.done()
    const url = constructPublicUrl(bucket, key, useCdn)

    return {
        url,
        key,
        filename: key.slice(key.lastIndexOf('/') + 1)
    }
}

/** The size of a stored file, or null when the bucket has no file under the key. */
export async function objectSize(key: string): Promise<number | null> {
    try {
        const head = await s3Client.send(new HeadObjectCommand({ Bucket: env.DO_SPACES_BUCKET, Key: key }))
        return head.ContentLength ?? 0
    } catch (error) {
        if (isS3NotFound(error)) return null
        throw error
    }
}

/** Every key under `prefix` in `bucket`, across all pages of the listing. */
export async function listObjectKeys(bucket: string, prefix: string): Promise<string[]> {
    const keys: string[] = []
    let token: string | undefined
    do {
        const page = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
        for (const object of page.Contents ?? []) {
            if (object.Key) keys.push(object.Key)
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return keys
}

// Delete file
export async function deleteFile(bucket: string, key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    }))
}

// --- Direct uploads -------------------------------------------------------
//
// A client with no keys of ours sends a file straight to the bucket, with
// URLs that we sign. One PUT carries at most 5 GB; a bigger file goes up in
// parts (a multipart upload), each part with its own URL.

/**
 * A signed PUT of a whole file of exactly `sizeBytes`: the length is a signed
 * header, so the bucket refuses a PUT of any other size. The ACL is signed in,
 * but Spaces ignores an ACL in the query string: the PUT must send the
 * `x-amz-acl: public-read` header, or the file stays private.
 */
export async function presignPut(key: string, contentType: string, sizeBytes: number, expiresIn: number): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
        ACL: 'public-read',
    })
    return getSignedUrl(s3Client, command, { expiresIn })
}

/**
 * Opens a multipart upload and returns its id. The file is public and
 * carries the content type from the start, so the parts need no headers.
 */
export async function startMultipartUpload(key: string, contentType: string): Promise<string> {
    const { UploadId } = await s3Client.send(new CreateMultipartUploadCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
    }))
    if (!UploadId) throw new Error(`The bucket opened no multipart upload for ${key}`)
    return UploadId
}

/** A signed PUT of one part of a multipart upload, of exactly `sizeBytes`, as presignPut. */
export async function presignPart(
    key: string, uploadId: string, partNumber: number, sizeBytes: number, expiresIn: number,
): Promise<string> {
    const command = new UploadPartCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: sizeBytes,
    })
    return getSignedUrl(s3Client, command, { expiresIn })
}

export interface UploadedPart {
    partNumber: number
    size: number
    etag: string
}

/** The parts that the bucket holds for a multipart upload, by part number. */
export async function listUploadedParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = []
    let marker: string | undefined
    do {
        const page = await s3Client.send(new ListPartsCommand({
            Bucket: env.DO_SPACES_BUCKET,
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: marker,
        }))
        for (const part of page.Parts ?? []) {
            if (part.PartNumber && part.ETag) {
                parts.push({ partNumber: part.PartNumber, size: part.Size ?? 0, etag: part.ETag })
            }
        }
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined
    } while (marker)
    return parts.sort((a, b) => a.partNumber - b.partNumber)
}

/** Joins the parts into one file, under the key of the upload. */
export async function completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void> {
    await s3Client.send(new CompleteMultipartUploadCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })) },
    }))
}
