"use server"
import { NextResponse, NextRequest } from 'next/server'
import { z } from 'zod'
import { createCity, getCities } from '@/lib/db/cities'
import { uploadFile } from '@/lib/s3'
import { isUserAuthorizedToEdit } from '@/lib/auth'

const getCitiesQuerySchema = z.object({
    includeUnlisted: z.string()
        .optional()
        .transform((val) => val === 'true')
        .default('false')
});

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const queryParams = Object.fromEntries(searchParams.entries());

        const { includeUnlisted } = getCitiesQuerySchema.parse(queryParams);

        const cities = await getCities({
            includeUnlisted,
            includePending: false
        });

        return NextResponse.json(cities);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.errors },
                { status: 400 }
            );
        }
        console.error('Error fetching cities:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const authorizedToEdit = await isUserAuthorizedToEdit({})
    if (!authorizedToEdit) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const formData = await request.formData()
    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_municipality = formData.get('name_municipality') as string
    const name_municipality_en = formData.get('name_municipality_en') as string
    const timezone = formData.get('timezone') as string
    const logoImage = formData.get('logoImage') as File
    const authorityType = formData.get('authorityType') as 'municipality' | 'region' || 'municipality'
    const officialSupport = formData.get('officialSupport') === 'true'
    const status = (formData.get('status') as 'pending' | 'unlisted' | 'listed') || 'pending'

    if (!id || !name || !name_en || !name_municipality || !name_municipality_en || !timezone || !logoImage) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    try {
        const result = await uploadFile(logoImage, { 
            prefix: 'city-logos',
            useCdn: true 
        })
        const logoImageUrl = result.url

        const city = await createCity({
            id,
            name,
            name_en,
            name_municipality,
            name_municipality_en,
            timezone,
            logoImage: logoImageUrl,
            officialSupport,
            status,
            authorityType,
            wikipediaId: null,
            supportsNotifications: false,
            consultationsEnabled: false,
            peopleOrdering: 'default'
        })

        return NextResponse.json(city)
    } catch (error) {
        console.error('Error creating city:', error)
        return NextResponse.json({ error: 'Failed to create city' }, { status: 500 })
    }
}