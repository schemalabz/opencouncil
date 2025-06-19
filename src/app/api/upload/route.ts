import { NextResponse } from 'next/server'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { v4 as uuidv4 } from 'uuid'
import { env } from '@/env.mjs'

const s3Client = new S3({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: 'fra-1',
    credentials: {
        accessKeyId: env.DO_SPACES_KEY,
        secretAccessKey: env.DO_SPACES_SECRET,
    }
})

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        const fileExtension = file.name.split('.').pop()
        const fileName = `${uuidv4()}.${fileExtension}`

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: env.DO_SPACES_BUCKET,
                Key: `uploads/${fileName}`,
                Body: Buffer.from(await file.arrayBuffer()),
                ACL: 'public-read',
                ContentType: file.type,
            },
        })

        await upload.done()
        const url = `https://${env.DO_SPACES_BUCKET}.${env.DO_SPACES_ENDPOINT?.replace('https://', '')}/uploads/${fileName}`

        return NextResponse.json({ url })
    } catch (error) {
        console.error('Error uploading file:', error)
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }
} 