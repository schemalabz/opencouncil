import { NextResponse } from 'next/server'
import { getMapSubjects } from '@/lib/db/subject'
import { MAP_MONTHS_MAX, MAP_MONTHS_MIN } from '@/lib/map/constants'

// Filters vary per request (client refetch on filter change) — don't cache.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const monthsBackParam = searchParams.get('monthsBack');
        const topicIdsParam = searchParams.get('topicIds');

        const parsedMonths = monthsBackParam ? parseInt(monthsBackParam, 10) : NaN;
        const monthsBack = Number.isFinite(parsedMonths)
            ? Math.min(MAP_MONTHS_MAX, Math.max(MAP_MONTHS_MIN, parsedMonths))
            : undefined;
        const topicIds = topicIdsParam ? topicIdsParam.split(',').filter(Boolean) : undefined;

        const subjects = await getMapSubjects({ monthsBack, topicIds });
        return NextResponse.json(subjects);
    } catch (error) {
        console.error('Error fetching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}
