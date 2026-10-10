import { NextRequest, NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'
import { PutObjectAclCommand } from '@aws-sdk/client-s3'
import { verifyUploadAclToken } from '@/lib/uploadAclToken'

/**
 * Set ACL for an uploaded file to make it public.
 *
 * Only for a key that presigned-url issued, proved by the token it returned
 * with the key. That route authorized the upload; a key from anywhere else,
 * an upload of another body or city among them, stays private.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { key, token } = body as { key?: unknown; token?: unknown }

        if (!key || typeof key !== 'string' || !token || typeof token !== 'string') {
            return NextResponse.json(
                { error: 'Missing required fields: key and token' },
                { status: 400 }
            )
        }

        if (!verifyUploadAclToken(key, token)) {
            return NextResponse.json(
                { error: 'Unauthorized to modify file permissions' },
                { status: 403 }
            )
        }

        // Set ACL to public-read
        const command = new PutObjectAclCommand({
            Bucket: process.env.DO_SPACES_BUCKET,
            Key: key,
            ACL: 'public-read',
        })

        await s3Client.send(command)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error setting ACL:', error)
        return NextResponse.json(
            { error: 'Failed to set file permissions' },
            { status: 500 }
        )
    }
}
