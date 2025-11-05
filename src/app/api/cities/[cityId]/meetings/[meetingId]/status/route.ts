import { NextResponse } from 'next/server';
import { getMeetingStatusCached } from '@/lib/cache';
import { getCouncilMeeting } from '@/lib/db/meetings';

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    // Check if meeting exists and if user is authorized to view it (handles unreleased meetings)
    const meeting = await getCouncilMeeting(params.cityId, params.meetingId);
    
    if (!meeting) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const meetingStatus = await getMeetingStatusCached(params.cityId, params.meetingId);
    return NextResponse.json(meetingStatus);
}


