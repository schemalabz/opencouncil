import { NextRequest, NextResponse } from 'next/server';
import { deleteUtterances } from '@/lib/db/utterance';
import { getCurrentUser } from '@/lib/auth';

// Caps a single bulk-delete request to keep the wrapping Prisma transaction
// from timing out and to avoid an unconstrained deletion vector.
const MAX_BULK_DELETE_IDS = 500;

export async function DELETE(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let ids: unknown;
    try {
        const body = await request.json();
        ids = body.ids;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (ids.length > MAX_BULK_DELETE_IDS) {
        return NextResponse.json({ error: `ids must contain at most ${MAX_BULK_DELETE_IDS} entries` }, { status: 400 });
    }
    if (!ids.every((id): id is string => typeof id === 'string')) {
        return NextResponse.json({ error: 'ids must contain only strings' }, { status: 400 });
    }

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
