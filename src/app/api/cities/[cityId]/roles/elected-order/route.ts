import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { updateElectedOrder } from '@/lib/db/roles'
import { electedOrderRequestSchema } from '@/lib/zod-schemas/role'
import { handleApiError } from '@/lib/api/errors'

export async function POST(request: Request, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });

        const body = await request.json();
        const { administrativeBodyId, rankings } = electedOrderRequestSchema.parse(body);

        await updateElectedOrder(params.cityId, administrativeBodyId, rankings);

        revalidateTag(`city:${params.cityId}:people`, 'max');

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, 'Failed to update elected order');
    }
}
