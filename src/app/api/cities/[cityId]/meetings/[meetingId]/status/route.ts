import { NextResponse } from 'next/server';
import { getMeetingStatusCached } from '@/lib/cache';

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    const meetingStatus = await getMeetingStatusCached(params.cityId, params.meetingId);
    return NextResponse.json(meetingStatus);
}


