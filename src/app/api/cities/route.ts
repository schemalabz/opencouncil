import { NextResponse } from 'next/server'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { v4 as uuidv4 } from 'uuid'
import { createCity, getCities, getCity } from '@/lib/db/cities'

const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

export async function GET() {
    try {
        const cities = await Promise.all((await getCities()).map(async (city) => {
            return city;
        }));
        return NextResponse.json(cities)
    } catch (error) {
        console.error('Error fetching cities:', error)
        return NextResponse.json({ error: 'Failed to fetch cities' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const formData = await request.json()
    const id = formData.id as string
    const name = formData.name as string
    const name_en = formData.name_en as string
    const name_municipality = formData.name_municipality as string
    const name_municipality_en = formData.name_municipality_en as string
    const timezone = formData.timezone as string
    const logoImage = formData.logoImage as File

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

        const city = await createCity({
            id,
            name,
            name_en,
            name_municipality,
            name_municipality_en,
            timezone,
            logoImage: logoImageUrl,
        })

        return NextResponse.json(city)
    } catch (error) {
        console.error('Error creating city:', error)
        return NextResponse.json({ error: 'Failed to create city' }, { status: 500 })
    }
}