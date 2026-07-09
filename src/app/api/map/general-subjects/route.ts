import { NextResponse } from 'next/server'
import { getRealm } from '@/lib/realm.server'
import { getGeneralSubjectsCached, parseMapSubjectFilters } from '@/lib/db/subject'

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const result = await getGeneralSubjectsCached(await getRealm(), parseMapSubjectFilters(searchParams));
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching general (non-located) subjects:', error);
        return NextResponse.json({ error: 'Failed to fetch general subjects' }, { status: 500 });
    }
}
