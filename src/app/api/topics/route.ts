import { NextResponse } from 'next/server'
import { getTopics } from '@/lib/db/topics'

// Enable caching - topics rarely change, revalidate every 24 hours
export const revalidate = 86400;

export async function GET() {
    try {
        const topics = await getTopics();
        return NextResponse.json(topics);
    } catch (error) {
        console.error('Error fetching topics:', error);
        return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 });
    }
}
