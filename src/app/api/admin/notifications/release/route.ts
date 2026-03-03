import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsSentAdminAlert } from '@/lib/discord';
import prisma from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
    await withUserAuthorizedToEdit({});
    const currentUser = (await getCurrentUser())!;

    const body = await request.json();
    const { notificationIds } = body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return NextResponse.json(
            { error: 'notificationIds array is required' },
            { status: 400 }
        );
    }

    console.log(`Admin ${currentUser.email} releasing ${notificationIds.length} notifications`);

    // Look up meeting/city context from the notifications being released
    const notification = await prisma.notification.findFirst({
        where: { id: { in: notificationIds } },
        include: { city: true, meeting: true }
    });

    const result = await releaseNotifications(notificationIds);

    // Send Discord admin alert about manual release
    if (notification) {
        sendNotificationsSentAdminAlert({
            cityId: notification.cityId,
            meetingId: notification.meetingId,
            cityName: notification.city.name_en,
            meetingName: notification.meeting.name,
            notificationCount: notificationIds.length,
            emailsSent: result.emailsSent,
            messagesSent: result.messagesSent,
            failed: result.failed
        });
    }

    return NextResponse.json({
        success: result.success,
        emailsSent: result.emailsSent,
        messagesSent: result.messagesSent,
        failed: result.failed
    });
}

