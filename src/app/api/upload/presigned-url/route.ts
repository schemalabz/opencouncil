import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { env } from '@/env.mjs'
import { isUserAuthorizedToEdit } from '@/lib/auth'
import { UploadConfig } from '@/types/upload'

const s3Client = new S3Client({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: 'fra-1',
    credentials: {
        accessKeyId: env.DO_SPACES_KEY,
        secretAccessKey: env.DO_SPACES_SECRET,
    }
})

/**
 * Generate a meaningful filename based on upload config
 * Pattern: {cityId}_{identifier}_{suffix}.{ext}
 * Examples:
 *   - chania_aug15_2025_recording.mp4
 *   - chania_aug15_2025_agenda.pdf
 *   - chania_democrats_logo.png
 */
function generateBaseFilename(config: UploadConfig | undefined, extension: string): string {
    const parts = [
        config?.cityId,
        config?.identifier,
        config?.suffix
    ].filter(Boolean)
    
    return parts.length > 0 
        ? `${parts.join('_')}.${extension}`
        : `${uuidv4()}.${extension}`
}

/**
 * Check if a file exists in S3
 */
async function fileExists(key: string): Promise<boolean> {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: env.DO_SPACES_BUCKET,
            Key: key,
        }))
        return true
    } catch (error: any) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false
        }
        // If there's another error, log it but assume file doesn't exist
        console.error('Error checking file existence:', error)
        return false
    }
}

/**
 * Find an available filename by adding numeric suffixes if needed
 * e.g., file.pdf -> file.pdf, file_2.pdf, file_3.pdf, etc.
 */
async function findAvailableFilename(baseFilename: string, prefix: string = 'uploads'): Promise<string> {
    const key = `${prefix}/${baseFilename}`
    
    // Check if base filename is available
    if (!await fileExists(key)) {
        return baseFilename
    }
    
    // Extract name and extension
    const lastDotIndex = baseFilename.lastIndexOf('.')
    const nameWithoutExt = lastDotIndex > 0 ? baseFilename.substring(0, lastDotIndex) : baseFilename
    const extension = lastDotIndex > 0 ? baseFilename.substring(lastDotIndex) : ''
    
    // Try with numeric suffixes
    let counter = 2
    while (counter <= 10) { // Limit to 10 attempts
        const newFilename = `${nameWithoutExt}_${counter}${extension}`
        const newKey = `${prefix}/${newFilename}`
        
        if (!await fileExists(newKey)) {
            return newFilename
        }
        
        counter++
    }
    
    // If we've exhausted all numeric attempts, fall back to clean UUID-based name
    const cleanUuidName = `${uuidv4()}${extension}`
    return cleanUuidName
}

/**
 * Generate a pre-signed URL for direct upload to DigitalOcean Spaces
 * 
 * This endpoint:
 * 1. Authenticates the user
 * 2. Validates upload permissions
 * 3. Generates a secure, short-lived pre-signed URL for PUT operation
 * 4. Returns the pre-signed URL and metadata for client-side upload
 */
export async function POST(request: NextRequest) {
    try {
        // Parse request body
        const body = await request.json()
        const { filename, contentType, config } = body

        // Validate required fields
        if (!filename || !contentType) {
            return NextResponse.json(
                { error: 'Missing required fields: filename and contentType' },
                { status: 400 }
            )
        }

        // Check user authorization
        // If cityId is provided in config, check city-specific permissions
        // Otherwise, check general upload permissions
        const cityId = config?.cityId
        const authorizedToEdit = await isUserAuthorizedToEdit(
            cityId ? { cityId } : {}
        )

        if (!authorizedToEdit) {
            return NextResponse.json(
                { error: 'Unauthorized to upload files' },
                { status: 403 }
            )
        }

        // Extract file extension
        const fileExtension = filename.split('.').pop() || 'bin'
        
        // Generate filename based on config
        const baseFilename = generateBaseFilename(config, fileExtension)
        
        // Find an available filename (handles collisions)
        const uniqueFilename = await findAvailableFilename(baseFilename, 'uploads')
        const key = `uploads/${uniqueFilename}`

        // Create S3 PutObject command
        const command = new PutObjectCommand({
            Bucket: env.DO_SPACES_BUCKET,
            Key: key,
            ContentType: contentType,
            ACL: 'public-read',
        })

        // Generate pre-signed URL with 5 minute expiration
        // Note: Type casting needed due to AWS SDK v3 type compatibility issues
        const expiresIn = 300 // 5 minutes in seconds
        const presignedUrl = await getSignedUrl(s3Client as any, command as any, { expiresIn })

        // Construct the public URL that will be accessible after upload
        const publicUrl = `https://${env.DO_SPACES_BUCKET}.${env.DO_SPACES_ENDPOINT?.replace('https://', '')}/uploads/${uniqueFilename}`

        return NextResponse.json({
            url: presignedUrl,
            key,
            publicUrl,
            expiresIn,
        })
    } catch (error) {
        console.error('Error generating pre-signed URL:', error)
        return NextResponse.json(
            { error: 'Failed to generate upload URL' },
            { status: 500 }
        )
    }
}

