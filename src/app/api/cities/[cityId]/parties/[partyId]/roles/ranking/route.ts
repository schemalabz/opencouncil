import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { updateRoleRankings } from '@/lib/db/roles'

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

        await updateRoleRankings(params.cityId, params.partyId, rankings);

        // Revalidate cache
        revalidateTag(`city:${params.cityId}:parties`);
        revalidateTag(`city:${params.cityId}:people`);
        revalidatePath(`/${params.cityId}/parties/${params.partyId}`);
        revalidatePath(`/${params.cityId}/people`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating role rankings:', error);

        // Handle validation errors with appropriate status codes
        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            if (error.message.includes('do not belong') || error.message.includes('does not belong')) {
                return NextResponse.json({ error: error.message }, { status: 403 });
            }
        }

        return NextResponse.json({ error: 'Failed to update rankings' }, { status: 500 });
    }
}

