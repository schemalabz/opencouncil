import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import prisma from '@/lib/db/prisma'

export async function POST(
    request: Request,
    { params }: { params: { cityId: string, partyId: string } }
) {
    try {
        await withUserAuthorizedToEdit({ partyId: params.partyId });
        
        const body = await request.json();
        const { rankings }: { rankings: Array<{ roleId: string, rank: number | null }> } = body;

        if (!Array.isArray(rankings)) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        // Update roles in a transaction
        await prisma.$transaction(
            rankings.map(({ roleId, rank }) =>
                prisma.role.update({
                    where: { id: roleId },
                    data: { rank }
                })
            )
        );

        // Revalidate cache
        revalidateTag(`city:${params.cityId}:parties`);
        revalidateTag(`city:${params.cityId}:people`);
        revalidatePath(`/${params.cityId}/parties/${params.partyId}`);
        revalidatePath(`/${params.cityId}/people`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating role rankings:', error);
        return NextResponse.json({ error: 'Failed to update rankings' }, { status: 500 });
    }
}

