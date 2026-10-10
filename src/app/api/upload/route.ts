import { NextResponse } from 'next/server'
import * as z from 'zod'
import { uploadFile } from '@/lib/s3'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { handleApiError } from '@/lib/api/errors'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { imageFile } from '@/lib/zod-schemas/primitives'

const isImage = (file: File) => file.type.startsWith('image/')

/**
 * The product-update editor uploads email images here, and the consultations
 * page uploads regulation JSON. An image must pass the shared image limit.
 * Another file type keeps the old behaviour and has no size limit.
 */
const uploadRequestSchema = z.object({
    file: z.file().check(ctx => {
        if (!isImage(ctx.value)) return
        const result = imageFile().safeParse(ctx.value)
        for (const issue of result.error?.issues ?? []) ctx.issues.push({ code: 'custom', message: issue.message, input: ctx.value })
    }),
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
