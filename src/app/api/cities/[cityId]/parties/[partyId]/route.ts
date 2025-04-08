import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { v4 as uuidv4 } from 'uuid'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getParty, editParty, deleteParty } from '@/lib/db/parties'

const s3Client = new S3({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!
    }
})

export async function GET(request: Request, { params }: { params: { cityId: string, partyId: string } }) {
    try {
        const party = await getParty(params.partyId)
        if (!party) {
            return NextResponse.json({ error: 'Party not found' }, { status: 404 })
        }
        return NextResponse.json(party)
    } catch (error) {
        console.error('Error fetching party:', error)
        return NextResponse.json({ error: 'Failed to fetch party' }, { status: 500 })
    }
}

export async function PUT(request: Request, { params }: { params: { cityId: string, partyId: string } }) {
    const formData = await request.json()
    const name = formData.name as string
    const name_en = formData.name_en as string
    const name_short = formData.name_short as string
    const name_short_en = formData.name_short_en as string
    const colorHex = formData.colorHex as string
    const logo = formData.logo as File | null

    let logoUrl: string | undefined = undefined

    if (logo) {
        const fileExtension = logo.name.split('.').pop()
        const fileName = `${uuidv4()}.${fileExtension}`

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.DO_SPACES_BUCKET!,
                Key: `party-logos/${fileName}`,
                Body: Buffer.from(await logo.arrayBuffer()),
                ACL: 'public-read',
                ContentType: logo.type,
            },
        })

        try {
            await upload.done()
            logoUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_ENDPOINT}/party-logos/${fileName}`
        } catch (error) {
            console.error('Error uploading file:', error)
            return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
        }
    }

    try {
        const party = await editParty(params.partyId, {
            name,
            name_en,
            name_short,
            name_short_en,
            colorHex,
            ...(logoUrl && { logo: logoUrl }),
        })

        revalidateTag(`city:${params.cityId}:parties`);
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(party)
    } catch (error) {
        console.error('Error editing party:', error)
        return NextResponse.json({ error: 'Failed to edit party' }, { status: 500 })
    }
}

export async function DELETE(request: Request, { params }: { params: { cityId: string, partyId: string } }) {
    try {
        await deleteParty(params.partyId)
        revalidateTag(`city:${params.cityId}:parties`);
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);
        return NextResponse.json({ message: 'Party deleted successfully' })
    } catch (error) {
        console.error('Error deleting party:', error)
        return NextResponse.json({ error: 'Failed to delete party' }, { status: 500 })
    }
}
