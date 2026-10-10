import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsSentAdminAlert } from '@/lib/discord';
import prisma from '@/lib/db/prisma';
import { meetingLabel } from '@/lib/meetingName';
import { meetingNameSelect } from '@/lib/db/types';
import { releaseNotificationsRequestSchema } from '@/lib/zod-schemas/notification';

export async function POST(request: NextRequest) {
    try {
        await withUserAuthorizedToEdit({});
        const currentUser = (await getCurrentUser())!;

        const { notificationIds } = releaseNotificationsRequestSchema.parse(await request.json());

        console.log(`Admin ${currentUser.email} releasing ${notificationIds.length} notifications`);

        // Look up meeting/city context from the notifications being released
        const notification = await prisma.notification.findFirst({
            where: { id: { in: notificationIds } },
            include: { city: true, meeting: { include: { administrativeBody: meetingNameSelect.administrativeBody } } }
        });

        const result = await releaseNotifications(notificationIds);

        // Send Discord admin alert about manual release
        if (notification) {
            sendNotificationsSentAdminAlert({
                cityId: notification.cityId,
                meetingId: notification.meetingId,
                cityName: notification.city.name_en,
                meetingName: meetingLabel(notification.meeting, 'el', notification.city.timezone),
                notificationCount: notificationIds.length,
                emailsSent: result.emailsSent,
                failed: result.failed,
                leftPending: result.leftPending
            });
        }

        return NextResponse.json({
            success: result.success,
            emailsSent: result.emailsSent,
            failed: result.failed
        });
    } catch (error) {
        return handleApiError(error, 'Failed to release notifications');
    }
}

