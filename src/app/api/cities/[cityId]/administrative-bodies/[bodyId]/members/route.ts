import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { importBodyMembers } from '@/lib/db/bodyMembers';
import { handleApiError } from '@/lib/api/errors';
import { rosterImportSchema } from '@/lib/zod-schemas/bodyMembers';
import { revalidatePath, revalidateTag } from 'next/cache';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

/** Import the members of a pasted list that the admin confirmed (#829). For an admin of the body or of its city. */
export async function POST(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        const { entries, startDate } = rosterImportSchema.parse(await request.json());
        const result = await importBodyMembers(cityId, bodyId, entries, { startDate });
        // The cached roster feeds the meeting pages and the overview too, and
        // the city row carries the roster counts the overview reads.
        revalidateTag(`city:${cityId}:people`, 'max');
        revalidateTag(`city:${cityId}:basic`, 'max');
        revalidatePath(`/${cityId}/people`);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to import the members of the body');
    }
}
