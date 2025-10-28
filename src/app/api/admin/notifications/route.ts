import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { getNotificationsForAdmin } from '@/lib/db/notifications';

export async function GET(request: NextRequest) {
    await withUserAuthorizedToEdit({});

    const searchParams = request.nextUrl.searchParams;
    const cityId = searchParams.get('cityId') || undefined;
    const status = searchParams.get('status') as 'pending' | 'sent' | 'failed' | undefined;
    const type = searchParams.get('type') as 'beforeMeeting' | 'afterMeeting' | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const notifications = await getNotificationsForAdmin({
        cityId,
        status,
        type,
        limit,
        offset
    });

    return NextResponse.json({
        notifications,
        count: notifications.length
    });
}

