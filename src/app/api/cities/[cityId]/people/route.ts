import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createPerson, getPeopleForCity } from '@/lib/db/people'
import { uploadFile } from '@/lib/s3'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { personFormDataSchema, type PersonFormDataOutput } from '@/lib/zod-schemas/person'
import { getPartiesForCity } from '@/lib/db/parties'
import { getPublicAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies'
import { getRoleLimitForCity, getCurrentUser } from '@/lib/auth'
import { validateRoles, validateRolesForBodyAdmin } from '@/lib/utils/roles'
import { handleApiError, notAuthorizedErrorResponse } from '@/lib/api/errors'

export async function GET(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    const people = await getPeopleForCity(params.cityId);
    return NextResponse.json(people)
}

export async function POST(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    // null: a city admin or a superadmin. A set: the bodies a body admin may
    // give roles on; empty for everyone else.
    const roleLimit = await getRoleLimitForCity(params.cityId)
    if (roleLimit && roleLimit.size === 0) {
        return notAuthorizedErrorResponse(Boolean(await getCurrentUser()));
    }
    console.log('Creating person')
    let data: PersonFormDataOutput
    try {
        data = await parseFormData(await readFormData(request), personFormDataSchema)
    } catch (error) {
        return handleApiError(error, 'Failed to parse form data')
    }
    const { name, name_en, name_short, name_short_en, image, profileUrl, roles } = data

    // Validate roles
    try {
        // Get valid parties and administrative bodies for this city
        const [parties, adminBodies] = await Promise.all([
            getPartiesForCity(params.cityId),
            getPublicAdministrativeBodiesForCity(params.cityId)
        ]);

        const validPartyIds = new Set(parties.map(p => p.id));
        const validAdminBodyIds = new Set(adminBodies.map(a => a.id));

        // Validate roles using shared helper
        const validationError = validateRoles(roles, params.cityId, validPartyIds, validAdminBodyIds)
            ?? (roleLimit ? validateRolesForBodyAdmin(roles, roleLimit) : null);
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
