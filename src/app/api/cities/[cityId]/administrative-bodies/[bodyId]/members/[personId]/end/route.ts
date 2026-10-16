import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath, revalidateTag } from 'next/cache';
import { endBodyMembership } from '@/lib/db/bodyMembers';
import { handleApiError } from '@/lib/api/errors';
import { membershipEndSchema } from '@/lib/zod-schemas/bodyMembers';

type Params = { params: Promise<{ cityId: string; bodyId: string; personId: string }> };

/** End the membership of one person on the body (#829). The role stays, with an end date. */
export async function POST(request: NextRequest, props: Params) {
    const { cityId, bodyId, personId } = await props.params;
    try {
        const { endDate } = membershipEndSchema.parse(await request.json().catch(() => ({})));
        const result = await endBodyMembership(cityId, bodyId, personId, endDate ?? undefined);
        // The cached roster feeds the meeting pages and the overview too.
        revalidateTag(`city:${cityId}:people`, 'max');
        revalidatePath(`/${cityId}/people`);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to end the membership');
    }
}
