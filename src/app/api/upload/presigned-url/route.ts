import { NextRequest, NextResponse } from 'next/server'
import { s3Client, constructPublicUrl } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/env.mjs'
import { withServiceOrUserAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api/errors'
import { availableUploadKey } from '@/lib/uploads/naming'

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

        // Check authorization via service API key or user session
        const cityId = config?.cityId
        try {
            await withServiceOrUserAuth(request, cityId ? { cityId } : {})
        } catch (error) {
            if (error instanceof ApiError) {
                return NextResponse.json({ error: error.message }, { status: error.statusCode })
            }
            throw error
        }

        // Extract file extension
        const fileExtension = filename.split('.').pop() || 'bin'
        
        // Generate filename based on config, made unique (handles collisions)
        const key = await availableUploadKey(config, fileExtension)

        // Create S3 PutObject command (without ACL for now)
        const command = new PutObjectCommand({
            Bucket: env.DO_SPACES_BUCKET,
            Key: key,
            ContentType: contentType,
        })

        // Generate pre-signed URL with 5 minute expiration
        // Note: Type casting needed due to AWS SDK v3 type compatibility issues
        const expiresIn = 300 // 5 minutes in seconds
        const presignedUrl = await getSignedUrl(s3Client as any, command as any, { expiresIn })

        // Construct the public URL that will be accessible after upload
        const publicUrl = constructPublicUrl(env.DO_SPACES_BUCKET, key)

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

