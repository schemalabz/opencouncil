import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getPartiesForCity, createParty } from '@/lib/db/parties'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { z } from 'zod'
import { parseFormData } from '@/lib/api/form-data-parser'
import { partyFormDataSchema } from '@/lib/zod-schemas/party'

export async function GET(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    const parties = await getPartiesForCity(params.cityId)
    return NextResponse.json(parties)
}

export async function POST(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId })
        const { name, name_en, name_short, name_short_en, colorHex, logo } =
            await parseFormData(await request.formData(), partyFormDataSchema)

        let logoUrl: string | undefined = undefined

        if (logo) {
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

        revalidateTag(`city:${params.cityId}:parties`, 'max');
        // The city row carries the roster counts the overview reads to decide
        // whether it has data at all, so a new or deleted member ages it too.
        revalidateTag(`city:${params.cityId}:basic`, 'max');
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(party)
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 })
        }
        console.error('Error creating party:', error)
        return NextResponse.json({ error: 'Failed to create party' }, { status: 500 })
    }
}
