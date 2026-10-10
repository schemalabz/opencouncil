import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getPerson, editPerson, deletePerson } from '@/lib/db/people'
import { getPartiesForCity } from '@/lib/db/parties'
import { getPublicAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { personFormDataSchema, type PersonFormDataOutput } from '@/lib/zod-schemas/person'
import { isUserAuthorizedToEdit } from '@/lib/auth'
import { validateRoles } from '@/lib/utils/roles'
import { errorResponse, handleApiError } from '@/lib/api/errors'

export async function GET(
    request: Request,
    props: { params: Promise<{ cityId: string, personId: string }> }
) {
    const params = await props.params;
    const person = await getPerson(params.personId)
    return NextResponse.json(person)
}

export async function PUT(
    request: Request,
    props: { params: Promise<{ cityId: string, personId: string }> }
) {
    const params = await props.params;
    const authorizedToEdit = await isUserAuthorizedToEdit({ personId: params.personId })
    if (!authorizedToEdit) {
        return errorResponse(401, "Unauthorized");
    }
    console.log(`Updating person ${params.personId}`)
    let data: PersonFormDataOutput
    try {
        data = await parseFormData(await readFormData(request), personFormDataSchema)
    } catch (error) {
        return handleApiError(error, 'Failed to parse form data')
    }
    const { name, name_en, name_short, name_short_en, image, removeImage, profileUrl, roles } = data

    try {
        // Validate roles
        console.log('Starting role validation...')
        // Get valid parties and administrative bodies for this city
        const [parties, adminBodies] = await Promise.all([
            getPartiesForCity(params.cityId),
            getPublicAdministrativeBodiesForCity(params.cityId)
        ]);
        console.log('Got parties and admin bodies')

        const validPartyIds = new Set(parties.map(p => p.id));
        const validAdminBodyIds = new Set(adminBodies.map(a => a.id));

        // Validate roles using shared helper
        const validationError = validateRoles(roles, params.cityId, validPartyIds, validAdminBodyIds);
        if (validationError) {
            console.log('Validation failed:', validationError);
            return NextResponse.json(validationError, { status: 400 });
        }
        console.log('Validation passed');
    } catch (error) {
        console.error('Error validating roles:', error);
        return NextResponse.json({ error: 'Failed to validate roles' }, { status: 500 });
    }

    let imageUrl: string | undefined = undefined

    if (image) {
        try {
            const result = await uploadFile(image, { prefix: 'person-images' })
            imageUrl = result.url
        } catch (error) {
            console.error('Error uploading file:', error)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
    }

    try {
        console.log('Updating person in database...')
        const person = await editPerson(params.personId, {
            name,
            name_en,
            name_short,
            name_short_en,
            ...(imageUrl ? { image: imageUrl } : removeImage ? { image: null } : {}),
            profileUrl: profileUrl || null,
            roles
        })

        console.log('Person updated successfully')
        revalidateTag(`city:${params.cityId}:people`, 'max');
        revalidateTag(`city:${params.cityId}:parties`, 'max');
        // The city row carries the roster counts the overview reads to decide
        // whether it has data at all, so a new or deleted member ages it too.
        revalidateTag(`city:${params.cityId}:basic`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(person)
    } catch (error) {
        console.error('Error updating person:', error)
        return NextResponse.json({ error: 'Failed to update person' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    props: { params: Promise<{ cityId: string, personId: string }> }
) {
    const params = await props.params;
    const authorizedToDelete = await isUserAuthorizedToEdit({ personId: params.personId })
    if (!authorizedToDelete) {
        return errorResponse(401, "Unauthorized");
    }
    try {
        await deletePerson(params.personId)
        revalidateTag(`city:${params.cityId}:people`, 'max');
        revalidateTag(`city:${params.cityId}:parties`, 'max');
        // The city row carries the roster counts the overview reads to decide
        // whether it has data at all, so a new or deleted member ages it too.
        revalidateTag(`city:${params.cityId}:basic`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);
        revalidatePath(`/admin/people`);
        return NextResponse.json({ message: 'Person deleted successfully' })
    } catch (error) {
        console.error('Error deleting person:', error)
        return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 })
    }
}
