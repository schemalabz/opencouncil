import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { createNotificationsForMeeting } from '@/lib/db/notifications';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } from '@/lib/discord';
import prisma from '@/lib/db/prisma';

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    try {
        // Check authorization
        await withUserAuthorizedToEdit({ cityId: params.cityId });

        const body = await request.json();
        const { type, subjectImportances, sendImmediately } = body;

        // Validate input
        if (!type || !['beforeMeeting', 'afterMeeting'].includes(type)) {
            return NextResponse.json(
                { error: 'Valid type (beforeMeeting or afterMeeting) is required' },
                { status: 400 }
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
                city: true
            }
        });

        // Send Discord admin alert about notification creation
        if (stats.notificationsCreated > 0 && meeting) {
            sendNotificationsCreatedAdminAlert({
                cityName: meeting.city.name_en,
                meetingName: meeting.name,
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
            console.log(`Released notifications: ${releaseResult.emailsSent} emails, ${releaseResult.messagesSent} messages sent`);

            // Send Discord admin alert about sending
            sendNotificationsSentAdminAlert({
                notificationCount: stats.notificationsCreated,
                emailsSent: releaseResult.emailsSent,
                messagesSent: releaseResult.messagesSent,
                failed: releaseResult.failed
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
        console.error('Error creating notifications for meeting:', error);

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

