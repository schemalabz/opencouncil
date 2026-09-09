import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiSubjects } from '@/lib/db/subjectsApi';
import { getRealm } from '@/lib/realm.server';
import { meetingSubjectListQuerySchema } from '@/lib/zod-schemas/subject';
import { withServiceOrUserAuth } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        const query = Object.fromEntries(request.nextUrl.searchParams.entries());
        const { introducerId, limit, includeUnreleased } = meetingSubjectListQuerySchema.parse(query);

        // includeUnreleased requires auth (service key or authorized user)
        if (includeUnreleased) {
            await withServiceOrUserAuth(request, { cityId: params.cityId });
        }

        const subjects = await getApiSubjects(await getRealm(), params.cityId, {
            meetingId: params.meetingId,
            introducerId,
            limit,
            includeUnreleased,
        });

        return NextResponse.json(subjects);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, 'Failed to fetch subjects');
    }
}
