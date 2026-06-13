import { NextResponse } from 'next/server'
import type { AdministrativeBodyType } from '@prisma/client'
import { getMapSubjects } from '@/lib/db/subject'
import { getSubjectMetricsCached } from '@/lib/cache/queries'
import { MAP_MONTHS_MAX, MAP_MONTHS_MIN } from '@/lib/map/constants'

// Filters vary per request (client refetch on filter change) — don't cache.
export const dynamic = 'force-dynamic';

const BODY_TYPES: AdministrativeBodyType[] = ['council', 'committee', 'community'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function idList(raw: string | null): string[] | undefined {
    if (!raw) return undefined;
    const ids = raw.split(',').map(id => id.trim()).filter(Boolean);
    return ids.length > 0 ? ids : undefined;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const parsedMonths = parseInt(searchParams.get('monthsBack') ?? '', 10);
        const monthsBack = Number.isFinite(parsedMonths)
            ? Math.min(MAP_MONTHS_MAX, Math.max(MAP_MONTHS_MIN, parsedMonths))
            : undefined;

        const bodyTypes = idList(searchParams.get('bodyTypes'))
            ?.filter((value): value is AdministrativeBodyType => (BODY_TYPES as string[]).includes(value));
        const fromRaw = searchParams.get('from');
        const toRaw = searchParams.get('to');

        // Reuse the cached, filter-independent discussion metrics so this
        // per-request (uncached) route never re-aggregates them.
        const metrics = await getSubjectMetricsCached();
        const subjects = await getMapSubjects({
            monthsBack,
            topicIds: idList(searchParams.get('topicIds')),
            cityIds: idList(searchParams.get('cityIds')),
            bodyTypes: bodyTypes && bodyTypes.length > 0 ? bodyTypes : undefined,
            dateFrom: fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : undefined,
            dateTo: toRaw && ISO_DATE.test(toRaw) ? toRaw : undefined,
        }, metrics);
        return NextResponse.json(subjects, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('Error fetching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}
