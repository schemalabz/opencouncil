import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath, revalidateTag } from 'next/cache';
import { startNewTerm } from '@/lib/db/bodyMembers';
import { handleApiError } from '@/lib/api/errors';
import { membershipEndSchema } from '@/lib/zod-schemas/bodyMembers';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

/** Start a new term: every active membership of the body ends (#829). The admin then adds the new members. */
export async function POST(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        const { endDate } = membershipEndSchema.parse(await request.json().catch(() => ({})));
        const result = await startNewTerm(cityId, bodyId, endDate ?? undefined);
        // The cached roster feeds the meeting pages and the overview too.
        revalidateTag(`city:${cityId}:people`, 'max');
        revalidatePath(`/${cityId}/people`);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to start a new term');
    }
}
