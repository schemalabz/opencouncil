import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import {
    getNotificationsGroupedByMeeting,
    getNotificationsForMeeting,
    getCitiesWithNotifications,
    deleteNotificationsForMeetings
} from '@/lib/db/notifications';

/**
 * GET /api/admin/notifications
 * Returns notifications grouped by meeting with pagination
 */
export async function GET(request: NextRequest) {
    await withUserAuthorizedToEdit({});

    const searchParams = request.nextUrl.searchParams;

    // Check if this is a request for a specific meeting's notifications
    const meetingId = searchParams.get('meetingId');
    const cityIdForMeeting = searchParams.get('cityIdForMeeting');

    if (meetingId && cityIdForMeeting) {
        // Return notifications for a specific meeting (for expanded view)
        const type = searchParams.get('type') as 'beforeMeeting' | 'afterMeeting' | undefined;
        const notifications = await getNotificationsForMeeting(meetingId, cityIdForMeeting, type);
        return NextResponse.json({ notifications });
    }

    // Check if this is a request for cities list
    if (searchParams.get('getCities') === 'true') {
        const cities = await getCitiesWithNotifications();
        return NextResponse.json({ cities });
    }

    // Otherwise, return meeting-grouped notifications
    const cityId = searchParams.get('cityId') || undefined;
    const status = searchParams.get('status') as 'pending' | 'sent' | 'failed' | undefined;
    const type = searchParams.get('type') as 'beforeMeeting' | 'afterMeeting' | undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // Parse date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (startDateStr) {
        startDate = new Date(startDateStr);
    }
    if (endDateStr) {
        endDate = new Date(endDateStr);
    }

    const result = await getNotificationsGroupedByMeeting({
        cityId,
        status,
        type,
        startDate,
        endDate,
        page,
        pageSize
    });

    return NextResponse.json(result);
}

/**
 * DELETE /api/admin/notifications
 * Bulk delete notifications for specified meetings
 */
export async function DELETE(request: NextRequest) {
    await withUserAuthorizedToEdit({});

    const body = await request.json();
    const { meetingKeys } = body as {
        meetingKeys: Array<{ meetingId: string; cityId: string }>;
    };

    if (!meetingKeys || !Array.isArray(meetingKeys) || meetingKeys.length === 0) {
        return NextResponse.json(
            { error: 'meetingKeys array is required' },
            { status: 400 }
        );
    }

    const deletedCount = await deleteNotificationsForMeetings(meetingKeys);

    return NextResponse.json({
        success: true,
        deletedCount
    });
}
