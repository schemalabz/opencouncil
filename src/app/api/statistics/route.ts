import { NextRequest, NextResponse } from 'next/server';
import { getStatisticsFor } from '@/lib/statistics';
import { isUserAuthorizedToEdit, getUnreleasedScope } from '@/lib/auth';

// This route uses dynamic data from request params and can't be statically optimized
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const personId = searchParams.get('personId');
        const partyId = searchParams.get('partyId');
        const meetingId = searchParams.get('meetingId');
        const cityId = searchParams.get('cityId');
        const subjectId = searchParams.get('subjectId');
        const administrativeBodyId = searchParams.get('administrativeBodyId');

        // What the viewer may see of the city's drafts: a meeting's editors see
        // that meeting, a body admin sees the meetings of their bodies.
        const includeUnreleased = cityId && meetingId ? await isUserAuthorizedToEdit({ cityId, councilMeetingId: meetingId }) : false;
        const unreleased = cityId && !includeUnreleased ? await getUnreleasedScope(cityId) : undefined;

        const params: any = {};
        if (personId) params.personId = personId;
        if (partyId) params.partyId = partyId;
        if (meetingId) params.meetingId = meetingId;
        if (cityId) params.cityId = cityId;
        if (subjectId) params.subjectId = subjectId;
        if (administrativeBodyId) params.administrativeBodyId = administrativeBodyId;
        params.includeUnreleased = includeUnreleased;
        params.unreleased = unreleased;

        const groupBy = ['topic', 'person', 'party'] as ('topic' | 'person' | 'party')[];
        const statistics = await getStatisticsFor(params, groupBy);

        return NextResponse.json(statistics);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch statistics' },
            { status: 500 }
        );
    }
} 