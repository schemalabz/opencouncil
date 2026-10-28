import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { env } from '@/env.mjs'
import { isS3NotFound } from '@opencouncil/subject-images/store'

// Global S3 client instance
export const s3Client = new S3Client({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: 'fra-1',
    credentials: {
        accessKeyId: env.DO_SPACES_KEY,
        secretAccessKey: env.DO_SPACES_SECRET,
    }
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

// Check if file exists
export async function fileExists(bucket: string, key: string): Promise<boolean> {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        }))
        return true
    } catch (error) {
        if (isS3NotFound(error)) {
            return false
        }
        console.error('Error checking file existence:', error)
        return false
    }
}

// Delete file
export async function deleteFile(bucket: string, key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    }))
}

// Presigned URL generation (for direct uploads)
export async function generatePresignedUrl(
    key: string,
    contentType: string,
    expiresIn: number = 300
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
    })

    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    return await getSignedUrl(s3Client as any, command as any, { expiresIn })
}
