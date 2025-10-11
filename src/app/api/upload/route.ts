import { NextResponse } from 'next/server'
import { uploadFile } from '@/lib/s3'
import { isUserAuthorizedToEdit } from '@/lib/auth'

export async function POST(request: Request) {
    try {
        const authorizedToEdit = await isUserAuthorizedToEdit({})
        if (!authorizedToEdit) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        const result = await uploadFile(file)
        return NextResponse.json({ url: result.url })
    } catch (error) {
        console.error('Error uploading file:', error)
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }
} 