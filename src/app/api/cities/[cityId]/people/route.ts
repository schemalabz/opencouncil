import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createPerson, deletePerson, editPerson, getPeopleForCity } from '@/lib/db/people'

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
    const formData = await request.formData()
    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_short = formData.get('name_short') as string
    const name_short_en = formData.get('name_short_en') as string
    const role = formData.get('role') as string
    const role_en = formData.get('role_en') as string
    const image = formData.get('image') as File | null
    const partyId = formData.get('partyId') as string
    const isAdministrativeRole = formData.get('isAdministrativeRole') === 'true'
    const profileUrl = formData.get('profileUrl') as string

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

    const person = await createPerson({
        cityId: params.cityId,
        name,
        name_en,
        name_short,
        name_short_en,
        role,
        role_en,
        activeFrom: formData.get('activeFrom') ? new Date(formData.get('activeFrom') as string) : new Date(),
        activeTo: formData.get('activeTo') ? new Date(formData.get('activeTo') as string) : null,
        image: imageUrl || null,
        partyId: partyId || null,
        isAdministrativeRole,
        profileUrl: profileUrl || null
    });

    return NextResponse.json(person)
}
