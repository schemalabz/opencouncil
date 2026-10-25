import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getPerson, editPerson, deletePerson } from '@/lib/db/people'
import { validatePersonRoles } from '@/lib/db/personRoles'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { personUpdateFormDataSchema, type PersonUpdateFormDataOutput } from '@/lib/zod-schemas/person'
import { isUserAuthorizedToEdit, getRoleLimitForCity, getCurrentUser } from '@/lib/auth'
import { handleApiError, notAuthorizedErrorResponse } from '@/lib/api/errors'
import { rolesOfPerson, rolesWithBodyType, withPersonImageAuthorized } from '@/lib/db/personImage'

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
        return notAuthorizedErrorResponse(Boolean(await getCurrentUser()));
    }
    console.log(`Updating person ${params.personId}`)
    let data: PersonUpdateFormDataOutput
    try {
        data = parseFormData(await readFormData(request), personUpdateFormDataSchema)
    } catch (error) {
        return handleApiError(error, 'Failed to parse form data')
    }
    const { name, name_en, name_short, name_short_en, image, removeImage, profileUrl, roles } = data

    // Absent roles stay as they are: a person who claimed their own page
    // edits name and photo only, and their form sends no roles.
    if (roles !== undefined) try {
        const validationError = await validatePersonRoles(params.cityId, roles, await getRoleLimitForCity(params.cityId));
        if (validationError) {
            console.log('Validation failed:', validationError);
            return NextResponse.json(validationError, { status: 400 });
        }
        console.log('Validation passed');
    } catch (error) {
        console.error('Error validating roles:', error);
        return NextResponse.json({ error: 'Failed to validate roles' }, { status: 500 });
    }

    // Before the upload, so a refused photo leaves no file behind (#829).
    if (image) {
        try {
            await withPersonImageAuthorized(roles ? await rolesWithBodyType(roles) : await rolesOfPerson(params.personId), params.personId)
        } catch (error) {
            return handleApiError(error, 'Failed to update person')
        }
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
    const authorizedToDelete = await isUserAuthorizedToEdit({})
    if (!authorizedToDelete) {
        return notAuthorizedErrorResponse(Boolean(await getCurrentUser()));
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
