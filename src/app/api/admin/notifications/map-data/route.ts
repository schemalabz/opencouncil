import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getNotificationMapData } from '@/lib/db/notifications';

export async function GET(request: NextRequest) {
    await withUserAuthorizedToEdit({});

    const searchParams = request.nextUrl.searchParams;
    const meetingId = searchParams.get('meetingId');
    const cityId = searchParams.get('cityId');

    if (!meetingId || !cityId) {
        return NextResponse.json(
            { error: 'meetingId and cityId are required' },
            { status: 400 }
        );
    }

    const result = await getNotificationMapData(meetingId, cityId);

    return NextResponse.json(result);
}

