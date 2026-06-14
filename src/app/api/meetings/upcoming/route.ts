import { NextResponse } from 'next/server'
import { getUpcomingMeetings } from '@/lib/db/meetings'

// Upcoming meetings change as time passes — don't cache.
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const meetings = await getUpcomingMeetings();
        return NextResponse.json(meetings);
    } catch (error) {
        console.error('Error fetching upcoming meetings:', error);
        return NextResponse.json({ error: 'Failed to fetch upcoming meetings' }, { status: 500 });
    }
}
