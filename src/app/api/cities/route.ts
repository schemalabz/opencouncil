import { NextResponse, NextRequest } from 'next/server'
import { z } from 'zod'
import { createCity, getCities } from '@/lib/db/cities'
import { uploadFile } from '@/lib/s3'
import { isUserAuthorizedToEdit } from '@/lib/auth'
import { createCityFormDataSchema } from '@/lib/zod-schemas/city'
import { parseFormData } from '@/lib/api/form-data-parser'

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

    try {
        const formData = await request.formData();
        const data = await parseFormData(formData, createCityFormDataSchema);

        const result = await uploadFile(data.logoImage, {
            prefix: 'city-logos',
            useCdn: true
        });
        const logoImageUrl = result.url;

        const city = await createCity({
            id: data.id,
            name: data.name,
            name_en: data.name_en,
            name_municipality: data.name_municipality,
            name_municipality_en: data.name_municipality_en,
            timezone: data.timezone,
            logoImage: logoImageUrl,
            officialSupport: data.officialSupport,
            status: data.status,
            authorityType: data.authorityType,
            wikipediaId: null,
            supportsNotifications: data.supportsNotifications,
            consultationsEnabled: data.consultationsEnabled,
            peopleOrdering: data.peopleOrdering,
            highlightCreationPermission: data.highlightCreationPermission,
            diavgeiaUid: data.diavgeiaUid || null,
        });

        return NextResponse.json(city);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.errors },
                { status: 400 }
            );
        }
        console.error('Error creating city:', error);
        return NextResponse.json({ error: 'Failed to create city' }, { status: 500 });
    }
}