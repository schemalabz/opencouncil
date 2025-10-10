import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { uploadFile } from '@/lib/s3'
import { getParty, editParty, deleteParty } from '@/lib/db/parties'
import { withUserAuthorizedToEdit } from '@/lib/auth'

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
    try {
        await withUserAuthorizedToEdit({ partyId: params.partyId });
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
        await withUserAuthorizedToEdit({ partyId: params.partyId });
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
