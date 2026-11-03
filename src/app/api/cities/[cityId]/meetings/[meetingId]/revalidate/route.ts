import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { hasRight } from '@/lib/auth';

export async function POST(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    const hasPermission = await hasRight('meeting.manage', { cityId: params.cityId, councilMeetingId: params.meetingId });
    if (!hasPermission) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('revalidating meeting', params.meetingId);

    // Revalidate the API route
    revalidatePath(`/api/cities/${params.cityId}/meetings/${params.meetingId}`);
    revalidatePath(`/${params.cityId}/${params.meetingId}`, 'layout');

    return NextResponse.json({ revalidated: true, now: Date.now() });
} 