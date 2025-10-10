import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { v4 as uuidv4 } from 'uuid'
import { env } from '@/env.mjs'

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

export function generateRandomFilename(originalFilename: string): string {
    const extension = extractFileExtension(originalFilename)
    return `${uuidv4()}.${extension}`
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

    const filename = generateRandomFilename(file.name)
    const key = `${prefix}/${filename}`

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
        filename
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
    } catch (error: any) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
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
