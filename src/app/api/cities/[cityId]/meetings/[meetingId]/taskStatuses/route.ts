import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getTasksForMeeting } from '@/lib/db/getTasks';

const prisma = new PrismaClient();

export async function GET(
    request: NextRequest,
    { params }: { params: { cityId: string, meetingId: string } }
) {
    const { cityId, meetingId } = params;
    try {
        const tasks = await getTasksForMeeting(cityId, meetingId);

        return NextResponse.json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
}
