import { NextResponse } from 'next/server'
import * as z from 'zod'
import { uploadFile } from '@/lib/s3'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { handleApiError } from '@/lib/api/errors'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { IMAGE_TOO_LARGE } from '@/lib/zod-schemas/primitives'
import { MAX_IMAGE_BYTES } from '@/lib/utils/imageUpload'

const isImage = (file: File) => file.type.startsWith('image/')

/**
 * The product-update editor uploads email images here, and the consultations
 * page uploads regulation JSON. An image must pass the shared image limit.
 * Another file type keeps the old behaviour and has no size limit.
 */
const uploadRequestSchema = z.object({
    file: z.file().refine(file => !isImage(file) || file.size <= MAX_IMAGE_BYTES, { error: IMAGE_TOO_LARGE }),
})

export async function POST(request: Request) {
    try {
        await withUserAuthorizedToEdit({})
        const { file } = parseFormData(await readFormData(request), uploadRequestSchema)

        const result = await uploadFile(file)
        return NextResponse.json({ url: result.url })
    } catch (error) {
        return handleApiError(error, 'Failed to upload file')
    }
}
