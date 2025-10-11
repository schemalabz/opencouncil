import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'

// Enable caching - topics rarely change, revalidate every 24 hours
export const revalidate = 86400;

export async function GET() {
    try {
        const topics = await prisma.topic.findMany({
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(topics);
    } catch (error) {
        console.error('Error fetching topics:', error);
        return NextResponse.json({ error: 'Failed to fetch topics' }, { status: 500 });
    }
}

