import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getParty, editParty, deleteParty } from '@/lib/db/parties'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { parseFormData, readFormData } from '@/lib/api/form-data-parser'
import { partyFormDataSchema } from '@/lib/zod-schemas/party'
import { handleApiError } from '@/lib/api/errors'

export async function GET(
    request: Request,
    props: { params: Promise<{ cityId: string, partyId: string }> }
) {
    const params = await props.params;
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

export async function PUT(
    request: Request,
    props: { params: Promise<{ cityId: string, partyId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ partyId: params.partyId });
        const { name, name_en, name_short, name_short_en, colorHex, logo, removeLogo } =
            parseFormData(await readFormData(request), partyFormDataSchema)

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

        const party = await editParty(params.partyId, {
            name,
            name_en,
            name_short,
            name_short_en,
            colorHex,
            ...(logoUrl ? { logo: logoUrl } : removeLogo ? { logo: null } : {}),
        })

        revalidateTag(`city:${params.cityId}:parties`, 'max');
        // The city row carries the roster counts the overview reads to decide
        // whether it has data at all, so a new or deleted member ages it too.
        revalidateTag(`city:${params.cityId}:basic`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);

        return NextResponse.json(party)
    } catch (error) {
        return handleApiError(error, 'Failed to edit party');
    }
}

export async function DELETE(
    request: Request,
    props: { params: Promise<{ cityId: string, partyId: string }> }
) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ partyId: params.partyId });
        await deleteParty(params.partyId)
        revalidateTag(`city:${params.cityId}:parties`, 'max');
        // The city row carries the roster counts the overview reads to decide
        // whether it has data at all, so a new or deleted member ages it too.
        revalidateTag(`city:${params.cityId}:basic`, 'max');
        revalidatePath(`/${params.cityId}/people`);
        revalidatePath(`/${params.cityId}/parties`);
        return NextResponse.json({ message: 'Party deleted successfully' })
    } catch (error) {
        return handleApiError(error, 'Failed to delete party');
    }
}
