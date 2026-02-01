import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getPerson, editPerson, deletePerson } from '@/lib/db/people'
import { getPartiesForCity } from '@/lib/db/parties'
import { getAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies'
import { Role } from '@prisma/client'
import { isUserAuthorizedToEdit } from '@/lib/auth'
import { validateRoles } from '@/lib/utils/roles'

export async function GET(request: Request, { params }: { params: { cityId: string, personId: string } }) {
    const person = await getPerson(params.personId)
    return NextResponse.json(person)
}

export async function PUT(request: Request, { params }: { params: { cityId: string, personId: string } }) {
    const authorizedToEdit = await isUserAuthorizedToEdit({ personId: params.personId })
    if (!authorizedToEdit) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    console.log(`Updating person ${params.personId}`)
    let formData: FormData;
    try {
        console.log('About to parse form data...', {
            contentType: request.headers.get('content-type'),
            method: request.method,
            bodyUsed: request.bodyUsed
        })
        formData = await request.formData()
        console.log('Form data received')
    } catch (error) {
        console.error('Error parsing form data:', error)
        return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
    }

    // Log received data
    console.log('Received form data fields:', Array.from(formData.keys()))

    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_short = formData.get('name_short') as string
    const name_short_en = formData.get('name_short_en') as string
    const image = formData.get('image') as File | null
    const profileUrl = formData.get('profileUrl') as string
    const rolesJson = formData.get('roles') as string
    console.log('Raw roles JSON:', rolesJson)
    let roles: Role[];

    try {
        roles = JSON.parse(rolesJson) as Role[]
        console.log('Parsed roles:', roles)

        // Validate roles
        console.log('Starting role validation...')
        // Get valid parties and administrative bodies for this city
        const [parties, adminBodies] = await Promise.all([
            getPartiesForCity(params.cityId),
            getAdministrativeBodiesForCity(params.cityId)
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

    if (image && image instanceof File) {
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
            ...(imageUrl && { image: imageUrl }),
            profileUrl: profileUrl || null,
            roles
        })

        console.log('Person updated successfully')
        revalidateTag(`city:${params.cityId}:people`);
        revalidateTag(`city:${params.cityId}:parties`);
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(person)
    } catch (error) {
        console.error('Error updating person:', error)
        return NextResponse.json({ error: 'Failed to update person' }, { status: 500 })
    }
}

export async function DELETE(request: Request, { params }: { params: { cityId: string, personId: string } }) {
    const authorizedToDelete = await isUserAuthorizedToEdit({ personId: params.personId })
    if (!authorizedToDelete) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    try {
        await deletePerson(params.personId)
        revalidateTag(`city:${params.cityId}:people`);
        revalidateTag(`city:${params.cityId}:parties`);
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);
        revalidatePath(`/admin/people`);
        return NextResponse.json({ message: 'Person deleted successfully' })
    } catch (error) {
        console.error('Error deleting person:', error)
        return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 })
    }
}
