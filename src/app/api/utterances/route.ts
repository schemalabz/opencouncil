import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteUtterances } from '@/lib/db/utterance';
import { getCurrentUser } from '@/lib/auth';

// Caps a single bulk-delete request to keep the wrapping Prisma transaction
// from timing out and to avoid an unconstrained deletion vector.
const MAX_BULK_DELETE_IDS = 500;

const deleteUtterancesSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_DELETE_IDS),
});

export async function DELETE(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = deleteUtterancesSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
    }
    const { ids } = parsed.data;

    try {
        const deleted = await deleteUtterances(ids);
        return NextResponse.json({ deleted });
    } catch (error) {
        if (error instanceof Error && error.message === 'Not authorized') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        console.error('Error deleting utterances:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
