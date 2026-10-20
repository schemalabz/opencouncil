import { NextRequest, NextResponse } from 'next/server';
import { getRealm } from '@/lib/realm.server';
import { getPublicSubjectDescription } from '@/lib/db/subject';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { errorResponse, handleApiError } from '@/lib/api/errors';

/**
 * A subject's description as plain text, in full.
 *
 * The landing map ships every subject with a preview of it (see previewDescription),
 * and the selected card asks here for the rest. Public subjects of the request's
 * realm only — a released meeting of a public city, the map's own visibility rule,
 * on this realm's domain — and a subject that is hidden answers as missing, so the
 * route tells nothing about what it hides.
 * Cacheable for a few minutes like the subject image: a description changes only
 * when a meeting is reprocessed.
 */
const CACHE = 'public, max-age=300, s-maxage=300';

type RouteContext = { params: Promise<{ subjectId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const { subjectId } = await context.params;
        const description = await getPublicSubjectDescription(subjectId, await getRealm());
        if (description === null) return errorResponse(404, 'Subject not found');
        return NextResponse.json({ description: stripMarkdown(description) }, { headers: { 'Cache-Control': CACHE } });
    } catch (error) {
        return handleApiError(error, 'Failed to load the subject description');
    }
}
