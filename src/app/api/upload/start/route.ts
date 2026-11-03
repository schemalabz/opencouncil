import { NextRequest, NextResponse } from 'next/server'
import { withRight } from '@/lib/auth'
import { handleApiError } from '@/lib/api/errors'
import { extractFileExtension } from '@/lib/s3'
import { formatRefusal, startUpload } from '@/lib/uploads'
import { startUploadRequestSchema } from '@/lib/zod-schemas/upload'
import { uploadAuthorizationScope, uploadFormatOfFile, uploadRight } from '@/types/upload'

/**
 * Starts the upload of a meeting file from the browser: the URLs of its PUTs,
 * and for a file in parts what /api/upload/complete needs afterwards. The
 * extension of the file gives its format, which must be one that its kind
 * takes.
 */
export async function POST(request: NextRequest) {
    try {
        const { filename, sizeBytes, config } = startUploadRequestSchema.parse(await request.json())
        await withRight(uploadRight(config.kind), uploadAuthorizationScope(config))

        const format = uploadFormatOfFile(config.kind, filename)
        if (!format) throw formatRefusal(config.kind, `a .${extractFileExtension(filename).toLowerCase()} file`)
        return NextResponse.json(await startUpload(config, format, sizeBytes))
    } catch (error) {
        return handleApiError(error, 'Failed to start the upload')
    }
}
