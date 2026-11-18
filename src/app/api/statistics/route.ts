import { NextRequest, NextResponse } from 'next/server';
import { getStatisticsFor, type StatisticsFilter } from '@/lib/statistics';
import { isUserAuthorizedToEdit, getUnreleasedScope } from '@/lib/auth';
import { ALL_SCOPE, readTier, TIER_PARAM } from '@/lib/utils/bodyTier';

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

        // A person, a meeting, a subject or a body names its own tier, as its
        // page reads it. A total of a city or a party is the primary tier,
        // unless `tier` widens it.
        const namesOneItem = !!(personId || meetingId || subjectId || administrativeBodyId);
        const tier = readTier(searchParams.get(TIER_PARAM));
        const params: StatisticsFilter = {
            ...(personId && { personId }),
            ...(partyId && { partyId }),
            ...(meetingId && { meetingId }),
            ...(cityId && { cityId }),
            ...(subjectId && { subjectId }),
            ...(administrativeBodyId && { administrativeBodyId }),
            includeUnreleased,
            unreleased,
            scope: namesOneItem ? ALL_SCOPE : { tier: tier ?? undefined },
        };

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