import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { createNotificationsForMeeting } from '@/lib/db/notifications';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } from '@/lib/discord';
import prisma from '@/lib/db/prisma';
import { meetingLabelInCity } from '@/lib/meetingName';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const body = await request.json();
    const { type, subjectImportances, sendImmediately } = body;

    if (!type || !['beforeMeeting', 'afterMeeting'].includes(type)) {
        return NextResponse.json(
            { error: 'Valid type (beforeMeeting or afterMeeting) is required' },
            { status: 400 }
        );
    }

    // The body's setting binds the manual path as it binds the automatic one:
    // a body with its notifications off sends none, whoever asks.
    const held = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId: params.cityId, id: params.meetingId } },
        select: { administrativeBody: { select: { notificationBehavior: true } } },
    });
    if (!held) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }
    if (held.administrativeBody?.notificationBehavior === 'NOTIFICATIONS_DISABLED') {
        return NextResponse.json(
            { error: 'Notifications are disabled for the administrative body of this meeting' },
            { status: 409 }
        );
    }

    // Transform subjectImportances to the format expected by createNotificationsForMeeting
    const subjectImportanceOverrides: Record<string, {
        topicImportance: 'doNotNotify' | 'normal' | 'high';
        proximityImportance: 'none' | 'near' | 'wide';
    }> = {};

    if (subjectImportances && typeof subjectImportances === 'object') {
        Object.entries(subjectImportances).forEach(([subjectId, importance]: [string, any]) => {
            subjectImportanceOverrides[subjectId] = {
                topicImportance: importance.topicImportance || 'doNotNotify',
                proximityImportance: importance.proximityImportance || 'none'
            };
        });
    }

    console.log(`Creating ${type} notifications for meeting ${params.meetingId} with ${Object.keys(subjectImportanceOverrides).length} subject overrides`);

    // Create notifications
    const stats = await createNotificationsForMeeting(
        params.cityId,
        params.meetingId,
        type,
        subjectImportanceOverrides
    );

    console.log(`Created ${stats.notificationsCreated} notifications for ${stats.subjectsTotal} subjects`);

    // Get meeting details for Discord alert
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId: params.cityId, id: params.meetingId } },
        include: {
            city: true,
            administrativeBody: true,
        }
    });

    // Send Discord admin alert about notification creation
    if (stats.notificationsCreated > 0 && meeting) {
        sendNotificationsCreatedAdminAlert({
            cityName: meeting.city.name_en,
            meetingName: meetingLabelInCity(meeting, 'el'),
            notificationType: type,
            notificationsCreated: stats.notificationsCreated,
            subjectsTotal: stats.subjectsTotal,
            cityId: params.cityId,
            meetingId: params.meetingId,
            autoSend: sendImmediately || false
        });
    }

    // If sendImmediately is true, release the notifications
    let releaseResult = null;
    if (sendImmediately && stats.notificationIds.length > 0) {
        console.log('Sending notifications immediately...');
        releaseResult = await releaseNotifications(stats.notificationIds);
        console.log(`Released notifications: ${releaseResult.emailsSent} emails`);

        // Send Discord admin alert about sending
        sendNotificationsSentAdminAlert({
            cityId: params.cityId,
            meetingId: params.meetingId,
            cityName: meeting?.city.name_en ?? params.cityId,
            meetingName: meeting ? meetingLabelInCity(meeting, 'el') : params.meetingId,
            notificationCount: stats.notificationsCreated,
            emailsSent: releaseResult.emailsSent,
            failed: releaseResult.failed,
            leftPending: releaseResult.leftPending
        });
    }

    return NextResponse.json({
        success: true,
        notificationsCreated: stats.notificationsCreated,
        subjectsTotal: stats.subjectsTotal,
        sent: sendImmediately,
        releaseResult: releaseResult || undefined
    });
}

