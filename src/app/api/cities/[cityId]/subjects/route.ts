import { NextRequest, NextResponse } from 'next/server';
import { getApiSubjects } from '@/lib/db/subjectsApi';
import { getRealm } from '@/lib/realm.server';
import { subjectListQuerySchema } from '@/lib/zod-schemas/subject';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { resolveCityDateRange } from '@/lib/dates/cityDateRange';

export async function GET(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const query = Object.fromEntries(request.nextUrl.searchParams.entries());
        const { introducerId, from, to, limit, includeUnreleased } = subjectListQuerySchema.parse(query);

        // includeUnreleased requires an editor of the city
        if (includeUnreleased) {
            await withUserAuthorizedToEdit({ cityId: params.cityId });
        }

        const subjects = await getApiSubjects(await getRealm(), params.cityId, {
            introducerId,
            ...await resolveCityDateRange(params.cityId, { from, to }),
            limit,
            includeUnreleased,
        });

        return NextResponse.json(subjects);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch subjects');
    }
}
