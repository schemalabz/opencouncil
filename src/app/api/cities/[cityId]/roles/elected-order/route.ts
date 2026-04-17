import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { updateElectedOrder } from '@/lib/db/roles'
import { z } from 'zod'

const electedOrderSchema = z.object({
    rankings: z.array(z.object({
        roleId: z.string().min(1),
        electedOrder: z.number().int().nonnegative().nullable(),
    })),
});

export async function POST(
    request: Request,
    { params }: { params: { cityId: string } }
) {
    try {
        await withUserAuthorizedToEdit({ cityId: params.cityId });

        const body = await request.json();
        const { rankings } = electedOrderSchema.parse(body);

        await updateElectedOrder(params.cityId, rankings);

        revalidateTag(`city:${params.cityId}:people`);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating elected order:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request body', details: error.errors }, { status: 400 });
        }

        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            if (error.message.includes('do not belong')) {
                return NextResponse.json({ error: error.message }, { status: 403 });
            }
        }

        return NextResponse.json({ error: 'Failed to update elected order' }, { status: 500 });
    }
}
