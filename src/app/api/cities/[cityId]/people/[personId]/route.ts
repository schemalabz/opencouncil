import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getPerson, editPerson, deletePerson } from '@/lib/db/people'
import { withUserAuthorizedToEdit } from '@/lib/auth'

const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

export async function GET(request: Request, { params }: { params: { cityId: string, personId: string } }) {
    const person = await getPerson(params.personId)
    return NextResponse.json(person)
}

export async function PUT(request: Request, { params }: { params: { cityId: string, personId: string } }) {
    const formData = await request.formData()
    const name = formData.get('name') as string
    const name_en = formData.get('name_en') as string
    const name_short = formData.get('name_short') as string
    const name_short_en = formData.get('name_short_en') as string
    const role = formData.get('role') as string
    const role_en = formData.get('role_en') as string
    const partyId = formData.get('partyId') as string
    const isAdministrativeRole = formData.get('isAdministrativeRole') === 'true'
    const activeFrom = formData.get('activeFrom') ? new Date(formData.get('activeFrom') as string) : null
    const activeTo = formData.get('activeTo') ? new Date(formData.get('activeTo') as string) : null
    const image = formData.get('image') as File | null

    let imageUrl: string | undefined = undefined

    if (image) {
        const fileExtension = image.name.split('.').pop()
        const fileName = `${uuidv4()}.${fileExtension}`

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.DO_SPACES_BUCKET!,
                Key: `person-images/${fileName}`,
                Body: Buffer.from(await image.arrayBuffer()),
                ACL: 'public-read',
                ContentType: image.type,
            },
        })

        try {
            await upload.done()
            imageUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT?.replace('https://', '')}/person-images/${fileName}`
        } catch (error) {
            console.error('Error uploading file:', error)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
    }

    const person = await editPerson(params.personId, {
        name,
        name_en,
        name_short,
        name_short_en,
        role,
        role_en,
        partyId: partyId || null,
        isAdministrativeRole,
        activeFrom,
        activeTo,
        ...(imageUrl && { image: imageUrl }),
    })

    return NextResponse.json(person)
}

export async function DELETE(request: Request, { params }: { params: { cityId: string, personId: string } }) {
    try {
        await deletePerson(params.personId)
        return NextResponse.json({ message: 'Person deleted successfully' })
    } catch (error) {
        console.error('Error deleting person:', error)
        return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 })
    }
}
