import { NextRequest, NextResponse } from 'next/server';
import { getStatisticsFor } from '@/lib/statistics';

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

        const params: any = {};
        if (personId) params.personId = personId;
        if (partyId) params.partyId = partyId;
        if (meetingId) params.meetingId = meetingId;
        if (cityId) params.cityId = cityId;
        if (subjectId) params.subjectId = subjectId;
        if (administrativeBodyId) params.administrativeBodyId = administrativeBodyId;

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