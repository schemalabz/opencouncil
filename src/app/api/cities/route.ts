import { NextResponse, NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createCity, getCities, updateCityGeometry } from '@/lib/db/cities'
import { parseBoundaryInput } from '@/lib/utils/geojson'
import { getAllCitiesAsServiceKey } from '@/lib/db/citiesAdmin'
import { uploadFile } from '@/lib/s3'
import { isUserAuthorizedToEdit, validateBearerAuth } from '@/lib/auth'
import { citiesListQuerySchema, createCityFormDataSchema } from '@/lib/zod-schemas/city'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { errorResponse, handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const { includeUnlisted } = citiesListQuerySchema.parse(
            Object.fromEntries(searchParams.entries())
        );

        // Bearer auth: validate up front and dispatch to a non-server-action helper
        // for the superadmin-equivalent view. NEVER pass an "asSuperAdmin"-style flag
        // into a "use server" function — clients could call the server action directly.
        const bearer = await validateBearerAuth(req);

        const cities = bearer && includeUnlisted
            ? await getAllCitiesAsServiceKey()
            : await getCities({ includeNonPublic: includeUnlisted });

        return NextResponse.json(cities);
    } catch (error) {
        return handleApiError(error, 'An unexpected error occurred');
    }
}

export async function POST(request: Request) {
    const authorizedToEdit = await isUserAuthorizedToEdit({})
    if (!authorizedToEdit) {
        return errorResponse(401, "Unauthorized");
    }

    try {
        const formData = await readFormData(request);
        const data = await parseFormData(formData, createCityFormDataSchema);

        // Boundary paste: validate before any side effects (logo upload, insert).
        let boundary: ReturnType<typeof parseBoundaryInput> | null = null;
        if (data.geometry) {
            boundary = parseBoundaryInput(data.geometry);
            if (!boundary.ok) {
                return NextResponse.json({ error: `Invalid boundary GeoJSON: ${boundary.error}` }, { status: 400 });
            }
        }

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
            status: data.status,
            authorityType: data.authorityType,
            wikipediaId: null,
            supportsNotifications: data.supportsNotifications,
            consultationsEnabled: data.consultationsEnabled,
            highlightCreationPermission: data.highlightCreationPermission,
            diavgeiaUid: data.diavgeiaUid || null,
            language: data.language,
            realm: data.realm,
            population: null,
        });

        if (boundary?.ok) {
            await updateCityGeometry(city.id, boundary.geometry);
        }

        // Bust the all-cities caches so the new city is immediately visible —
        // notably getAllCityIdsCached, which the [cityId] layout uses to validate
        // slugs. Not the 'max' profile: that serves the old list one more time,
        // and the old list is a 404 for the city this response links to.
        revalidateTag('cities:all', { expire: 0 });

        return NextResponse.json(city);
    } catch (error) {
        return handleApiError(error, 'Failed to create city');
    }
}