import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createPerson, getPeopleForCity } from '@/lib/db/people'
import { uploadFile } from '@/lib/s3'
import { z } from 'zod'
import { parseFormData } from '@/lib/api/form-data-parser'
import { personFormDataSchema, type PersonFormData } from '@/lib/zod-schemas/person'
import { getPartiesForCity } from '@/lib/db/parties'
import { getAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies'
import { isUserAuthorizedToEdit } from '@/lib/auth'
import { validateRoles } from '@/lib/utils/roles'

export async function GET(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    const people = await getPeopleForCity(params.cityId);
    return NextResponse.json(people)
}

export async function POST(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    const authorizedToEdit = await isUserAuthorizedToEdit({ cityId: params.cityId })
    if (!authorizedToEdit) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    console.log('Creating person')
    let data: PersonFormData
    try {
        data = await parseFormData(await request.formData(), personFormDataSchema)
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 })
        }
        console.error('Error parsing form data:', error)
        return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
    }
    const { name, name_en, name_short, name_short_en, image, profileUrl, roles } = data

    // Validate roles
    try {
        // Get valid parties and administrative bodies for this city
        const [parties, adminBodies] = await Promise.all([
            getPartiesForCity(params.cityId),
            getAdministrativeBodiesForCity(params.cityId)
        ]);

        const validPartyIds = new Set(parties.map(p => p.id));
        const validAdminBodyIds = new Set(adminBodies.map(a => a.id));

        // Validate roles using shared helper
        const validationError = validateRoles(roles, params.cityId, validPartyIds, validAdminBodyIds);
        if (validationError) {
            return NextResponse.json(validationError, { status: 400 });
        }
    } catch (error) {
        console.error('Error validating roles:', error);
        return NextResponse.json({ error: 'Failed to validate roles' }, { status: 500 });
    }

    let imageUrl: string | undefined = undefined

    if (image) {
        try {
            const result = await uploadFile(image, { 
                prefix: 'person-images',
            })
            imageUrl = result.url
        } catch (error) {
            console.error('Error uploading file:', error)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
    }

    try {
        const person = await createPerson({
            cityId: params.cityId,
            name,
            name_en,
            name_short,
            name_short_en,
            image: imageUrl || null,
            profileUrl: profileUrl || null,
            roles
        });

        revalidateTag(`city:${params.cityId}:people`, 'max');
        revalidateTag(`city:${params.cityId}:parties`, 'max');
        // The city row carries the roster counts the overview reads to decide
        // whether it has data at all, so a new or deleted member ages it too.
        revalidateTag(`city:${params.cityId}:basic`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(person)
    } catch (error) {
        console.error('Error creating person:', error)
        return NextResponse.json({ error: 'Failed to create person' }, { status: 500 })
    }
}
