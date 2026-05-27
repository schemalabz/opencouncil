import { NextRequest, NextResponse } from 'next/server';
import { getUtteranceContext } from '@/lib/db/utteranceContext';
import { handleApiError } from '@/lib/api/errors';

const DEFAULT_WINDOW = 10;
const MAX_WINDOW = 50;

function parseWindow(raw: string | null, fallback: number): number | null {
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    if (n > MAX_WINDOW) return null;
    return n;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ utteranceId: string }> }
) {
    const { utteranceId } = await params;
    const { searchParams } = new URL(request.url);

    const before = parseWindow(searchParams.get('before'), DEFAULT_WINDOW);
    const after = parseWindow(searchParams.get('after'), DEFAULT_WINDOW);

    if (before === null || after === null) {
        return NextResponse.json(
            { error: `before/after must be integers in [0, ${MAX_WINDOW}]` },
            { status: 400 }
        );
    }

    try {
        const result = await getUtteranceContext(request, utteranceId, before, after);
        if (!result) {
            return NextResponse.json({ error: 'Utterance not found' }, { status: 404 });
        }
        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'Internal server error');
    }
}
