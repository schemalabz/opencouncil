import { NextResponse } from 'next/server'
import { getRealm } from '@/lib/realm.server'
import { getMapSubjectsCached, parseMapSubjectFilters } from '@/lib/db/subject'

// Per-request filters → not cached. Serves the client's on-filter-change refetch; the initial
// load calls getMapSubjectsCached directly (page.tsx).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const subjects = await getMapSubjectsCached(await getRealm(), parseMapSubjectFilters(searchParams));
        return NextResponse.json(subjects);
    } catch (error) {
        console.error('Error fetching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}
