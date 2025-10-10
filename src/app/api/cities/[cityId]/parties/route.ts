import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getPartiesForCity, createParty } from '@/lib/db/parties'
import { withUserAuthorizedToEdit } from '@/lib/auth'

export async function GET(request: Request, { params }: { params: { cityId: string } }) {
    const parties = await getPartiesForCity(params.cityId)
    return NextResponse.json(parties)
}

export async function POST(request: Request, { params }: { params: { cityId: string } }) {
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId })
        const formData = await request.formData()

        const name = formData.get('name') as string
        const name_en = formData.get('name_en') as string
        const name_short = formData.get('name_short') as string
        const name_short_en = formData.get('name_short_en') as string
        const colorHex = formData.get('colorHex') as string
        const logo = formData.get('logo') as File | null

        let logoUrl: string | undefined = undefined

        if (logo && logo instanceof File) {
            try {
                const result = await uploadFile(logo, { prefix: 'party-logos' })
                logoUrl = result.url
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
