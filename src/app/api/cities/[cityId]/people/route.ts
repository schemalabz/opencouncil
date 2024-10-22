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

export async function GET(request: Request, { params }: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await params;
    const people = await getPeopleForCity(cityId);
    return NextResponse.json(people)
}
export async function POST(request: Request, { params }: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await params;
    const formData = await request.json()
    const name = formData.name as string
    const name_en = formData.name_en as string
    const name_short = formData.name_short as string
    const name_short_en = formData.name_short_en as string
    const role = formData.role as string
    const role_en = formData.role_en as string
    const image = formData.image as File | null
    const partyId = formData.partyId as string | null
    const isAdministrativeRole = formData.isAdministrativeRole as boolean

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
        cityId,
        name,
        name_en,
        name_short,
        name_short_en,
        role,
        role_en,
        activeFrom: new Date(),
        activeTo: null,
        image: imageUrl || null,
        partyId: partyId || null,
        isAdministrativeRole,
    });

    return NextResponse.json(person)
}
