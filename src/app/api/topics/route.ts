import { NextResponse } from 'next/server'
import { getTopics } from '@/lib/db/topics'
import { getRealm } from '@/lib/realm.server'

// Topics are realm-specific and resolved from the request Host, so the response
// varies per domain — render dynamically rather than sharing one cached payload
// across .gr and .fr. (getTopics itself is a cheap query.)
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const topics = await getTopics(await getRealm());
        return NextResponse.json(topics);
    } catch (error) {
        console.error('Error fetching topics:', error);
        return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 });
    }
}
