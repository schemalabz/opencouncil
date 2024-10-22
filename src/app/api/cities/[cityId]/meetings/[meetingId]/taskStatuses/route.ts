import { NextRequest, NextResponse } from 'next/server';
import { getTasksForMeeting } from '@/lib/db/tasks';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ cityId: string, meetingId: string }> }
) {
    const { cityId, meetingId } = await params;
    try {
        const tasks = await getTasksForMeeting(cityId, meetingId);

        return NextResponse.json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
}
