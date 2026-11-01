import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api/errors'
import { completeUpload } from '@/lib/uploads'
import { completeUploadRequestSchema } from '@/lib/zod-schemas/upload'

/**
 * Joins the parts of an upload that /api/upload/start began. That route
 * authorized the upload; the token it returned proves it, so this one asks
 * for no session.
 */
export async function POST(request: NextRequest) {
    try {
        return NextResponse.json(await completeUpload(completeUploadRequestSchema.parse(await request.json())))
    } catch (error) {
        return handleApiError(error, 'Failed to complete the upload')
    }
}
