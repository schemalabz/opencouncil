"use server";

import { ProcessAgendaResult } from "../apiTypes";
import prisma from "../db/prisma";
import { revalidateMeeting } from "../cache";
import { saveSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";
import { generateImagesForMeeting } from "../subjectImages";
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

    // The agenda is authoritative, so saveSubjectsForMeeting both matches and
    // prunes: it keeps a subject's id when the incoming set still contains it
    // (by name first, so a renumbered agenda keeps each id with its own
    // subject; by index second, so a reworded item keeps its slot), and
    // deletes what nothing accounts for — with the auto highlights of the
    // pruned rows, which the SetNull relation would otherwise orphan.
    //
    // This runs in the callback, not at dispatch, so nothing is removed until
    // new results are ready to replace it — a failed dispatch costs no data.
    //
    // Deleting every subject first (what this did before) defeated the
    // matching entirely: nothing was left to match, so every subject came
    // back with a fresh id. Subject ids are public — in shared URLs, in the
    // search index, in notification links already sent — so a re-run silently
    // broke all of them. Re-summarizing was already correct, because it does
    // not pre-delete.
    await saveSubjectsForMeeting(
        subjects,
        task.councilMeeting.cityId,
        task.councilMeeting.id,
        undefined,
        { pruneUnmatched: true }
    );

    // Bust the meeting/subject cache now that the new agenda subjects are persisted,
    // BEFORE sending notifications below. The notification send is rate-limited
    // (~500ms/recipient), so revalidating only after it finishes would let early
    // recipients open the meeting and see stale content.
    revalidateMeeting(task.councilMeeting.cityId, task.councilMeeting.id);

    // Illustrations for the agenda subjects, days before the meeting. Not
    // awaited: the callback must not wait on Gemini, and each failure alerts
    // on its own.
    generateImagesForMeeting(task.councilMeeting.cityId, task.councilMeeting.id);

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
