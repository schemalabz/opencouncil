import { NextRequest, NextResponse } from 'next/server';
import { getApiSubjects } from '@/lib/db/subjectsApi';
import { getRealm } from '@/lib/realm.server';
import { meetingSubjectListQuerySchema } from '@/lib/zod-schemas/subject';
import { withRight } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        const query = Object.fromEntries(request.nextUrl.searchParams.entries());
        const { introducerId, limit, includeUnreleased } = meetingSubjectListQuerySchema.parse(query);

        // includeUnreleased requires drafts.read on the meeting
        if (includeUnreleased) {
            await withRight('drafts.read', { cityId: params.cityId, councilMeetingId: params.meetingId });
        }

        const subjects = await getApiSubjects(await getRealm(), params.cityId, {
            meetingId: params.meetingId,
            introducerId,
            limit,
            includeUnreleased,
        });

        return NextResponse.json(subjects);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch subjects');
    }
}
