import { NextResponse, NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createCity, getCities } from '@/lib/db/cities'
import { getAllCitiesAsServiceKey } from '@/lib/db/citiesAdmin'
import { uploadFile } from '@/lib/s3'
import { isUserAuthorizedToEdit, validateBearerAuth } from '@/lib/auth'
import { createCityFormDataSchema } from '@/lib/zod-schemas/city'
import { parseFormData } from '@/lib/api/form-data-parser'
import { handleApiError } from '@/lib/api/errors'

const getCitiesQuerySchema = z.object({
    includeUnlisted: z.string()
        .optional()
        .transform((val) => val === 'true')
        .default('false')
});

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const { includeUnlisted } = getCitiesQuerySchema.parse(
            Object.fromEntries(searchParams.entries())
        );

        // Bearer auth: validate up front and dispatch to a non-server-action helper
        // for the superadmin-equivalent view. NEVER pass an "asSuperAdmin"-style flag
        // into a "use server" function — clients could call the server action directly.
        const bearer = await validateBearerAuth(req);

        const cities = bearer && includeUnlisted
            ? await getAllCitiesAsServiceKey()
            : await getCities({ includeUnlisted, includePending: false });

        return NextResponse.json(cities);
    } catch (error) {
        // Preserve the legacy `{ error: ZodIssue[] }` shape for ZodError specifically;
        // every other error goes through the standard handler.
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'An unexpected error occurred');
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
            language: data.language,
            realm: data.realm,
            population: null,
        });

        // Bust the all-cities caches so the new city is immediately visible —
        // notably getAllCityIdsCached, which the [cityId] layout uses to validate
        // slugs (a freshly created city 404s until this tag is revalidated).
        revalidateTag('cities:all', 'max');

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