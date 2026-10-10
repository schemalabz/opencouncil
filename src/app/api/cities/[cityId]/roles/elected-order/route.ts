import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withUserAuthorizedToEdit } from '@/lib/auth'
import { updateElectedOrder } from '@/lib/db/roles'
import { z } from 'zod'
import { electedOrderSchema } from '@/lib/zod-schemas/role'

const electedOrderRequestSchema = z.object({
    administrativeBodyId: z.string().min(1),
    rankings: z.array(z.object({
        roleId: z.string().min(1),
        electedOrder: electedOrderSchema,
    })),
});

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
        console.error('Error updating elected order:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400 });
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
