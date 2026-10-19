import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { adminNotificationsQuerySchema } from '@/lib/zod-schemas/notification';
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
    try {
        await withUserAuthorizedToEdit({});

        const query = adminNotificationsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
        const { meetingId, cityIdForMeeting, cityId, status, type, page, pageSize, startDate } = query;

        // Check if this is a request for a specific meeting's notifications
        if (meetingId && cityIdForMeeting) {
            // Return notifications for a specific meeting (for expanded view)
            const notifications = await getNotificationsForMeeting(meetingId, cityIdForMeeting, type);
            return NextResponse.json({ notifications });
        }

        // Check if this is a request for cities list
        if (query.getCities) {
            const cities = await getCitiesWithNotifications();
            return NextResponse.json({ cities });
        }

        // When filtering by start date, default endDate to 90 days in the future
        // to include pending beforeMeeting notifications for upcoming meetings.
        // No dates = no date filter (all time).
        const endDate = query.endDate ?? (startDate ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) : undefined);

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
    } catch (error) {
        return handleApiError(error, 'Failed to fetch notifications');
    }
}

/**
 * DELETE /api/admin/notifications
 * Bulk delete notifications for specified meetings
 * Optionally filter by type (beforeMeeting/afterMeeting)
 */
export async function DELETE(request: NextRequest) {
    try {
        await withUserAuthorizedToEdit({});

        const body = await request.json();
        const { meetingKeys, type } = body as {
            meetingKeys: Array<{ meetingId: string; cityId: string }>;
            type?: 'beforeMeeting' | 'afterMeeting';
        };

        if (!meetingKeys || !Array.isArray(meetingKeys) || meetingKeys.length === 0) {
            return NextResponse.json(
                { error: 'meetingKeys array is required' },
                { status: 400 }
            );
        }

        const deletedCount = await deleteNotificationsForMeetings(meetingKeys, type);

        return NextResponse.json({
            success: true,
            deletedCount
        });
    } catch (error) {
        return handleApiError(error, 'Failed to delete notifications');
    }
}
