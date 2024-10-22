import { NextResponse } from 'next/server'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { v4 as uuidv4 } from 'uuid'
import { deleteCity, editCity, getCity } from '@/lib/db/cities'


const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

export async function GET(request: Request, { params }: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await params;
    const city = await getCity(cityId);
    return NextResponse.json(city)
}

export async function PUT(request: Request, { params }: { params: Promise<{ cityId: string }> }) {
    const formData = await request.json()
    const { cityId } = await params;
    const name = formData.name as string
    const name_en = formData.name_en as string
    const name_municipality = formData.name_municipality as string
    const name_municipality_en = formData.name_municipality_en as string
    const timezone = formData.timezone as string
    const logoImage = formData.logoImage as File | null

    let logoImageUrl: string | undefined = undefined

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

    const city = await editCity(cityId, {
        name,
        name_en,
        name_municipality,
        name_municipality_en,
        timezone,
        ...(logoImageUrl && { logoImage: logoImageUrl }),
    });

    return NextResponse.json(city)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await params;
    await deleteCity(cityId);
    return NextResponse.json({ message: 'City deleted successfully' })
}