import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { v4 as uuidv4 } from 'uuid'

const prisma = new PrismaClient()

const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

export async function GET(request: Request, { params }: { params: { id: string } }) {
    const city = await prisma.city.findUnique({
        where: { id: params.id },
    })
    return NextResponse.json(city)
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
    const formData = await request.formData()
    const name = formData.get('name') as string
    const timezone = formData.get('timezone') as string
    const logoImage = formData.get('logoImage') as File | null

    let logoImageUrl = undefined

    if (logoImage) {
        const fileExtension = logoImage.name.split('.').pop()
        const fileName = `${uuidv4()}.${fileExtension}`

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.DO_SPACES_BUCKET!,
                Key: `city-logos/${fileName}`,
                Body: Buffer.from(await logoImage.arrayBuffer()),
                ACL: 'public-read',
                ContentType: logoImage.type,
            },
        })

        try {
            await upload.done()
            logoImageUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/city-logos/${fileName}`
        } catch (error) {
            console.error('Error uploading file:', error)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
    }

    const city = await prisma.city.update({
        where: { id: params.id },
        data: {
            name,
            timezone,
            ...(logoImageUrl && { logoImage: logoImageUrl }),
        },
    })

    return NextResponse.json(city)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    await prisma.city.delete({
        where: { id: params.id },
    })
    return NextResponse.json({ message: 'City deleted successfully' })
}