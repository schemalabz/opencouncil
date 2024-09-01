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

export async function GET() {
    const cities = await prisma.city.findMany()
    return NextResponse.json(cities)
}

export async function POST(request: Request) {
    const formData = await request.formData()
    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_municipality = formData.get('name_municipality') as string
    const name_municipality_en = formData.get('name_municipality_en') as string
    const timezone = formData.get('timezone') as string
    const logoImage = formData.get('logoImage') as File

    if (!name || !name_en || !name_municipality || !timezone || !logoImage || !id) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

        const logoImageUrl = `https://townhalls-gr.fra1.digitaloceanspaces.com/city-logos/${fileName}`

        const city = await prisma.city.create({
            data: {
                id,
                name,
                name_en,
                name_municipality,
                name_municipality_en,
                timezone,
                logoImage: logoImageUrl,
            },
        })

        return NextResponse.json(city)
    } catch (error) {
        console.error('Error uploading file:', error)
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }
}