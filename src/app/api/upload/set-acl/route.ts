import { NextRequest, NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'
import { PutObjectAclCommand } from '@aws-sdk/client-s3'
import { isUserAuthorizedToEdit } from '@/lib/auth'

/**
 * Set ACL for an uploaded file to make it public
 */
export async function POST(request: NextRequest) {
    try {
        // Parse request body
        const body = await request.json()
        const { key } = body

        // Validate required fields
        if (!key) {
            return NextResponse.json(
                { error: 'Missing required field: key' },
                { status: 400 }
            )
        }

        // Check user authorization
        const authorizedToEdit = await isUserAuthorizedToEdit({})
        if (!authorizedToEdit) {
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
