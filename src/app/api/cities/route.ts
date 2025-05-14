"use server"
import { NextResponse, NextRequest } from 'next/server'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { v4 as uuidv4 } from 'uuid'
import { createCity, getCities, getCity } from '@/lib/db/cities'
import { PrismaClient } from '@prisma/client'

const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const includeAll = searchParams.get('includeAll') === 'true';

        // Fetch cities from our existing function, passing both flags when includeAll is true
        const cities = await getCities({
            includeUnlisted: includeAll,
            includePending: includeAll
        });

        // Add the supportsNotifications field
        const citiesWithNotifications = cities.map(city => ({
            ...city,
            // Use the field if it exists in the database, otherwise default to false
            supportsNotifications: city.supportsNotifications ?? false
        }));

        return NextResponse.json(citiesWithNotifications);
    } catch (error) {
        console.error('Error fetching cities:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
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
    const authorityType = formData.get('authorityType') as 'municipality' | 'region' || 'municipality'

    if (!id || !name || !name_en || !name_municipality || !name_municipality_en || !timezone || !logoImage) {
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

        const logoImageUrl = `${process.env.CDN_URL}/city-logos/${fileName}`

        const city = await createCity({
            id,
            name,
            name_en,
            name_municipality,
            name_municipality_en,
            timezone,
            logoImage: logoImageUrl,
            officialSupport: false,
            isListed: false,
            isPending: true,
            authorityType,
            wikipediaId: null,
        })

        return NextResponse.json(city)
    } catch (error) {
        console.error('Error creating city:', error)
        return NextResponse.json({ error: 'Failed to create city' }, { status: 500 })
    }
}