import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { v4 as uuidv4 } from 'uuid'
import { S3 } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getPartiesForCity, createParty } from '@/lib/db/parties'
import { env } from '@/env.mjs'

const s3Client = new S3({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: 'fra-1',
    credentials: {
        accessKeyId: env.DO_SPACES_KEY,
        secretAccessKey: env.DO_SPACES_SECRET
    }
})

export async function GET(request: Request, { params }: { params: { cityId: string } }) {
    const parties = await getPartiesForCity(params.cityId)
    return NextResponse.json(parties)
}

export async function POST(request: Request, { params }: { params: { cityId: string } }) {
    try {
        const formData = await request.formData()

        const name = formData.get('name') as string
        const name_en = formData.get('name_en') as string
        const name_short = formData.get('name_short') as string
        const name_short_en = formData.get('name_short_en') as string
        const colorHex = formData.get('colorHex') as string
        const logo = formData.get('logo') as File | null

        let logoUrl: string | undefined = undefined

        if (logo && logo instanceof File) {
            const fileExtension = logo.name.split('.').pop()
            const fileName = `${uuidv4()}.${fileExtension}`

            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: env.DO_SPACES_BUCKET,
                    Key: `party-logos/${fileName}`,
                    Body: Buffer.from(await logo.arrayBuffer()),
                    ACL: 'public-read',
                    ContentType: logo.type,
                },
            })

            try {
                await upload.done()
                logoUrl = `https://${env.DO_SPACES_BUCKET}.${env.DO_SPACES_ENDPOINT?.replace('https://', '')}/party-logos/${fileName}`
            } catch (error) {
                console.error('Error uploading file:', error)
                return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
            }
        }

        const party = await createParty({
            name,
            name_en,
            name_short,
            name_short_en,
            colorHex,
            logo: logoUrl || null,
            cityId: params.cityId,
        })

        revalidateTag(`city:${params.cityId}:parties`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(party)
    } catch (error) {
        console.error('Error creating party:', error)
        return NextResponse.json({ error: 'Failed to create party' }, { status: 500 })
    }
}
