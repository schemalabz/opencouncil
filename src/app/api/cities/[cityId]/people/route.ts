import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createPerson, getPeopleForCity } from '@/lib/db/people'
import { uploadFile } from '@/lib/s3'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { personFormDataSchema, type PersonFormDataOutput } from '@/lib/zod-schemas/person'
import { validatePersonRoles } from '@/lib/db/personRoles'
import { getRoleLimitForCity, getCurrentUser } from '@/lib/auth'
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
        data = parseFormData(await readFormData(request), personFormDataSchema)
    } catch (error) {
        return handleApiError(error, 'Failed to parse form data')
    }
    const { name, name_en, name_short, name_short_en, image, profileUrl, roles } = data

    try {
        const validationError = await validatePersonRoles(params.cityId, roles, roleLimit);
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
