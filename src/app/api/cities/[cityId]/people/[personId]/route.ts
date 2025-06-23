import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { v4 as uuidv4 } from 'uuid'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getPerson, editPerson, deletePerson } from '@/lib/db/people'
import { getPartiesForCity } from '@/lib/db/parties'
import { getAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies'
import { Role } from '@prisma/client'
import { env } from '@/env.mjs'
import { isUserAuthorizedToEdit } from '@/lib/auth'

const s3Client = new S3({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: 'fra-1',
    credentials: {
        accessKeyId: env.DO_SPACES_KEY,
        secretAccessKey: env.DO_SPACES_SECRET
    }
})

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

        // Validate each role
        for (const role of roles) {
            const roleTypes = [role.cityId, role.partyId, role.administrativeBodyId].filter(Boolean).length;
            console.log('Validating role:', {
                role,
                roleTypes,
                hasCity: Boolean(role.cityId),
                hasParty: Boolean(role.partyId),
                hasAdminBody: Boolean(role.administrativeBodyId)
            });

            // Validate city roles
            if (role.cityId) {
                if (role.cityId !== params.cityId) {
                    return NextResponse.json({
                        error: 'Invalid city role assignment. Role must be for the current city.'
                    }, { status: 400 });
                }
            }

            // Validate party roles
            if (role.partyId) {
                if (!validPartyIds.has(role.partyId)) {
                    return NextResponse.json({
                        error: 'Invalid party role assignment. Party must belong to the current city.'
                    }, { status: 400 });
                }
            }

            // Validate administrative body roles
            if (role.administrativeBodyId) {
                if (!validAdminBodyIds.has(role.administrativeBodyId)) {
                    return NextResponse.json({
                        error: 'Invalid administrative body role assignment. Administrative body must belong to the current city.'
                    }, { status: 400 });
                }
            }

            // Ensure only one type of role is assigned
            if (roleTypes !== 1) {
                return NextResponse.json({
                    error: 'Each role must be assigned to exactly one entity (city, party, or administrative body).'
                }, { status: 400 });
            }
        }
    } catch (error) {
        console.error('Error validating roles:', error);
        return NextResponse.json({ error: 'Failed to validate roles' }, { status: 500 });
    }

    let imageUrl: string | undefined = undefined

    if (image && image instanceof File) {
        const fileExtension = image.name.split('.').pop()
        const fileName = `${uuidv4()}.${fileExtension}`

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: env.DO_SPACES_BUCKET,
                Key: `person-images/${fileName}`,
                Body: Buffer.from(await image.arrayBuffer()),
                ACL: 'public-read',
                ContentType: image.type,
            },
        })

        try {
            await upload.done()
            imageUrl = `https://${env.DO_SPACES_BUCKET}.${env.DO_SPACES_ENDPOINT?.replace('https://', '')}/person-images/${fileName}`
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
