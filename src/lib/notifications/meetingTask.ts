// The notifications that follow the agenda or the summary of a meeting. The
// processAgenda and summarize callbacks ran the same block each; the pasted
// agenda (lib/agendaText.ts) runs it too, so it lives here once.
import "server-only";
import type { NotificationBehavior } from '@prisma/client';
import { createNotificationsForMeeting } from '@/lib/db/notifications';
import { releaseNotifications } from '@/lib/notifications/deliver';
import { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } from '@/lib/discord';
import { meetingLabelInCity, type MeetingNameFields } from '@/lib/meetingName';

export type MeetingForNotifications = MeetingNameFields & {
    id: string;
    cityId: string;
    administrativeBody: { name: string; name_en: string; notificationBehavior: NotificationBehavior } | null;
    city: { name_en: string; timezone: string };
};

/**
 * Create the notifications of a meeting whose subjects are in place, as the
 * body's setting says: none for a disabled body or a meeting with no body;
 * created and left pending for a body on approval; created and released at
 * once for a body on auto. A failure is logged and swallowed: the task that
 * saved the subjects succeeded, and the admin can send by hand.
 */
export async function notifyMeetingSubjects(meeting: MeetingForNotifications, type: 'beforeMeeting' | 'afterMeeting'): Promise<void> {
    const adminBody = meeting.administrativeBody;
    if (!adminBody || adminBody.notificationBehavior === 'NOTIFICATIONS_DISABLED') return;
    const target = { cityId: meeting.cityId, meetingId: meeting.id, cityName: meeting.city.name_en, meetingName: meetingLabelInCity(meeting, 'el') };
    try {
        const stats = await createNotificationsForMeeting(meeting.cityId, meeting.id, type);
        console.log(`Created ${stats.notificationsCreated} ${type} notifications for ${stats.subjectsTotal} subjects`);
        const autoSend = adminBody.notificationBehavior === 'NOTIFICATIONS_AUTO';
        if (stats.notificationsCreated > 0) {
            sendNotificationsCreatedAdminAlert({ ...target, notificationType: type, notificationsCreated: stats.notificationsCreated, subjectsTotal: stats.subjectsTotal, autoSend });
        }
        if (!autoSend) return;
        console.log('Auto-sending notifications...');
        const released = await releaseNotifications(stats.notificationIds);
        console.log(`Released notifications: ${released.emailsSent} emails`);
        sendNotificationsSentAdminAlert({ ...target, notificationCount: stats.notificationsCreated, emailsSent: released.emailsSent, failed: released.failed, leftPending: released.leftPending });
    } catch (error) {
        console.error(`Error creating ${type} notifications for ${meeting.cityId}/${meeting.id}:`, error);
    }
}
