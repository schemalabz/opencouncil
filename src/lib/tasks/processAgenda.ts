"use server";

import { ProcessAgendaResult } from "../apiTypes";
import prisma from "../db/prisma";
import { revalidateMeeting } from "../cache";
import { saveSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";
import { requestProcessAgendaInternal } from "./processAgendaInternal";

/**
 * User-facing Server Action that checks authorization before processing.
 */
export async function requestProcessAgenda(agendaUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    await withUserAuthorizedToEdit({ cityId });
    return requestProcessAgendaInternal(agendaUrl, councilMeetingId, cityId, { force });
}

export async function handleProcessAgendaResult(taskId: string, response: ProcessAgendaResult) {
    const task = await prisma.taskStatus.findUnique({
        where: {
            id: taskId
        },
        include: {
            councilMeeting: {
                include: {
                    administrativeBody: true,
                    city: true
                }
            }
        }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    // A success result with an empty `subjects` array is a valid outcome:
    // some agendas (e.g. λογοδοσία / accountability sessions) genuinely have no
    // extractable subjects. The backend reports success with `{ subjects: [] }`,
    // so this must NOT be treated as a failure.
    //
    // We distinguish two cases:
    //   - subjects is an array (including []): authoritative result → replace.
    //   - subjects missing/not an array: malformed/partial success payload →
    //     skip destructive replacement to avoid silently wiping existing agenda
    //     data, and do not throw (which would flip the succeeded task to failed).
    if (!Array.isArray(response?.subjects)) {
        console.warn(
            `processAgenda result for task ${taskId} has no subjects array (got ${typeof response?.subjects}); ` +
            `skipping subject replacement to avoid data loss. Task remains succeeded.`
        );
        return;
    }

    const subjects = response.subjects;

    // Delete existing subjects and auto-generated highlights before saving new ones.
    // This runs in the callback (not at dispatch time) so data is only deleted when
    // new results are ready to replace it — a failed dispatch won't cause data loss.
    // User-created highlights (createdById is set) are preserved — their subjectId
    // will be set to null by the onDelete: SetNull cascade when subjects are deleted.
    await prisma.highlight.deleteMany({
        where: { meetingId: task.councilMeeting.id, cityId: task.councilMeeting.cityId, subjectId: { not: null }, createdById: null }
    });
    await prisma.subject.deleteMany({
        where: { councilMeetingId: task.councilMeeting.id, cityId: task.councilMeeting.cityId }
    });

    await saveSubjectsForMeeting(
        subjects,
        task.councilMeeting.cityId,
        task.councilMeeting.id
    );

    // Bust the meeting/subject cache now that the new agenda subjects are persisted,
    // BEFORE sending notifications below. The notification send is rate-limited
    // (~500ms/recipient), so revalidating only after it finishes would let early
    // recipients open the meeting and see stale content.
    revalidateMeeting(task.councilMeeting.cityId, task.councilMeeting.id);

    // Create notifications if administrative body allows it
    const adminBody = task.councilMeeting.administrativeBody;
    if (adminBody && adminBody.notificationBehavior !== 'NOTIFICATIONS_DISABLED') {
        const { createNotificationsForMeeting } = await import('../db/notifications');
        const { releaseNotifications } = await import('../notifications/deliver');
        const { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } = await import('../discord');

        try {
            const stats = await createNotificationsForMeeting(
                task.councilMeeting.cityId,
                task.councilMeeting.id,
                'beforeMeeting'
            );

            console.log(`Created ${stats.notificationsCreated} beforeMeeting notifications for ${stats.subjectsTotal} subjects`);

            const autoSend = adminBody.notificationBehavior === 'NOTIFICATIONS_AUTO';

            // Send Discord admin alert about notification creation
            if (stats.notificationsCreated > 0) {
                sendNotificationsCreatedAdminAlert({
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: task.councilMeeting.name,
                    notificationType: 'beforeMeeting',
                    notificationsCreated: stats.notificationsCreated,
                    subjectsTotal: stats.subjectsTotal,
                    cityId: task.councilMeeting.cityId,
                    meetingId: task.councilMeeting.id,
                    autoSend
                });
            }

            // If auto-send is enabled, release notifications immediately
            if (autoSend) {
                console.log('Auto-sending notifications...');
                const releaseResult = await releaseNotifications(stats.notificationIds);
                console.log(`Released notifications: ${releaseResult.emailsSent} emails, ${releaseResult.messagesSent} messages sent`);

                // Send Discord admin alert about sending
                sendNotificationsSentAdminAlert({
                    cityId: task.councilMeeting.cityId,
                    meetingId: task.councilMeeting.id,
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: task.councilMeeting.name,
                    notificationCount: stats.notificationsCreated,
                    emailsSent: releaseResult.emailsSent,
                    messagesSent: releaseResult.messagesSent,
                    failed: releaseResult.failed
                });
            }
        } catch (error) {
            console.error('Error creating notifications after processAgenda:', error);
            // Don't throw - we don't want to fail the entire task if notifications fail
        }
    }
}
