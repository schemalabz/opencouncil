import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createPerson, getPeopleForCity } from '@/lib/db/people'
import { Upload } from "@aws-sdk/lib-storage"
import { S3 } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { Role } from '@prisma/client'
import { getPartiesForCity } from '@/lib/db/parties'
import { getAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies'

const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

export async function GET(request: Request, { params }: { params: { cityId: string } }) {
    const people = await getPeopleForCity(params.cityId);
    return NextResponse.json(people)
}

export async function POST(request: Request, { params }: { params: { cityId: string } }) {
    console.log('Creating person')
    const formData = await request.formData()
    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_short = formData.get('name_short') as string
    const name_short_en = formData.get('name_short_en') as string
    const image = formData.get('image') as File | null
    const profileUrl = formData.get('profileUrl') as string
    const rolesJson = formData.get('roles') as string
    const roles = JSON.parse(rolesJson) as Role[]

    // Validate roles
    try {
        // Get valid parties and administrative bodies for this city
        const [parties, adminBodies] = await Promise.all([
            getPartiesForCity(params.cityId),
            getAdministrativeBodiesForCity(params.cityId)
        ]);

        const validPartyIds = new Set(parties.map(p => p.id));
        const validAdminBodyIds = new Set(adminBodies.map(a => a.id));

        // Validate each role
        for (const role of roles) {
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
            const roleTypes = [role.cityId, role.partyId, role.administrativeBodyId].filter(Boolean).length;
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
                Bucket: process.env.DO_SPACES_BUCKET!,
                Key: `person-images/${fileName}`,
                Body: image,
                ACL: 'public-read',
                ContentType: image.type,
            },
        })

        try {
            await upload.done()
            imageUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/person-images/${fileName}`
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

        revalidateTag(`city:${params.cityId}:people`);
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(person)
    } catch (error) {
        console.error('Error creating person:', error)
        return NextResponse.json({ error: 'Failed to create person' }, { status: 500 })
    }
}
