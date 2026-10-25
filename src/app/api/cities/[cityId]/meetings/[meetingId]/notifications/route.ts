import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ConflictError, NotFoundError, handleApiError } from '@/lib/api/errors';
import { createNotificationsForMeeting } from '@/lib/db/notifications';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } from '@/lib/discord';
import prisma from '@/lib/db/prisma';
import { getCouncilMeetingDirect } from '@/lib/db/meetings';
import { getMeetingBodySettings } from '@/lib/db/administrativeBodies';
import { meetingLabelInCity } from '@/lib/meetingName';
import { meetingNameSelect } from '@/lib/db/types';
import { createMeetingNotificationsRequestSchema } from '@/lib/zod-schemas/notification';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    try {
        // The scope of the meeting, as on its edit: the admin of its body sends
        // the updates of their own meetings (#828).
        await withUserAuthorizedToEdit({ cityId: params.cityId, councilMeetingId: params.meetingId });

        const { type, subjectImportances, sendImmediately } = createMeetingNotificationsRequestSchema.parse(await request.json());

        // The body's setting binds the manual path as it binds the automatic one:
        // a body with its notifications off sends none, whoever asks.
        const held = await getCouncilMeetingDirect(params.cityId, params.meetingId);
        if (!held) {
            throw new NotFoundError('Meeting not found');
        }
        const bodySettings = await getMeetingBodySettings(params.cityId, params.meetingId);
        if (bodySettings?.notificationBehavior === 'NOTIFICATIONS_DISABLED') {
            throw new ConflictError('Notifications are disabled for the administrative body of this meeting');
        }

        console.log(`Creating ${type} notifications for meeting ${params.meetingId} with ${Object.keys(subjectImportances).length} subject overrides`);

        // Create notifications
        const stats = await createNotificationsForMeeting(
            params.cityId,
            params.meetingId,
            type,
            subjectImportances
        );

        console.log(`Created ${stats.notificationsCreated} notifications for ${stats.subjectsTotal} subjects`);

        // Get meeting details for Discord alert
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId: params.cityId, id: params.meetingId } },
            include: {
                city: true,
                administrativeBody: meetingNameSelect.administrativeBody,
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
                autoSend: sendImmediately
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
    } catch (error) {
        return handleApiError(error, 'Failed to create notifications');
    }
}

