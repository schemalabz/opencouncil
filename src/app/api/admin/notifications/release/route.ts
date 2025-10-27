import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsSentAdminAlert } from '@/lib/discord';

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser?.isSuperAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { notificationIds } = body;

        if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
            return NextResponse.json(
                { error: 'notificationIds array is required' },
                { status: 400 }
            );
        }

        console.log(`Admin ${currentUser.email} releasing ${notificationIds.length} notifications`);

        const result = await releaseNotifications(notificationIds);

        // Send Discord admin alert about manual release
        sendNotificationsSentAdminAlert({
            notificationCount: notificationIds.length,
            emailsSent: result.emailsSent,
            messagesSent: result.messagesSent,
            failed: result.failed
        });

        return NextResponse.json({
            success: result.success,
            emailsSent: result.emailsSent,
            messagesSent: result.messagesSent,
            failed: result.failed
        });

    } catch (error) {
        console.error('Error releasing notifications:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

