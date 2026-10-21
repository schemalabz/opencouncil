import "server-only";

import {
    countEmailRecipientsForMeeting,
    createNotificationsForMeeting,
    getMeetingForNotifications,
    type MeetingForNotifications,
} from '@/lib/db/notifications';
import { getLastSucceededTaskTimes } from '@/lib/db/tasksInternal';
import { sendNotificationsCreatedAdminAlert, sendNotificationsFailedAdminAlert, sendNotificationsSentAdminAlert } from '@/lib/discord';
import { meetingLabelInCity } from '@/lib/meetingName';
import { releaseNotifications } from './deliver';
import {
    classifyMeetingNews,
    NEWS_PHASES,
    notificationOutcome,
    type NewsDisposition,
    type NewsPhase,
    type NotificationOutcome,
} from './freshness';

/**
 * The notifications that the app creates by itself: when a processAgenda or
 * summarize task has succeeded, and when a meeting is released. What each one
 * does is `notificationOutcome` (./freshness). Creating them by hand from the
 * meeting admin panel stays the admin's call and does not go through here.
 */

/**
 * After a processAgenda or summarize task has become succeeded (tasks.ts),
 * never from inside its result handler. A release counts only succeeded tasks.
 * The task writes `succeeded` and then reads `released`; the release writes
 * `released` and then reads the tasks. So at least one of the two sees the
 * other, and whichever notifies reads complete results.
 */
export async function notifySubscribersOfTask(cityId: string, meetingId: string, phase: NewsPhase): Promise<void> {
    await guarded(cityId, meetingId, NEWS_PHASES[phase], async () => {
        const meeting = await getMeetingForNotifications(cityId, meetingId);
        const now = new Date();
        const outcome = notificationOutcome(meetingFacts(meeting), phase, now, now);
        if (outcome.kind === 'none') {
            console.log(`No ${NEWS_PHASES[phase]} notifications for ${cityId}/${meetingId}: ${outcome.reason}`);
            return;
        }
        await createAndAnnounce(meeting, phase, outcome.kind === 'sends');
    });
}

export interface ReleaseOutlook {
    /** The phase that Notis treats as news once the meeting is released, or why none is. */
    notis: { phase: NewsPhase; reason?: never } | { phase: null; reason: Exclude<NewsDisposition, 'fanout'> | 'noTasks' };
    /** What the release does with email for that phase, and how many readers it emails. */
    email: { phase: NewsPhase | null; outcome: NotificationOutcome; recipients: number };
}

/** What releasing the meeting now tells its subscribers. */
// Caller-gated: the release dialog's Server Action authorizes.
export async function getReleaseOutlook(cityId: string, meetingId: string, at: Date = new Date()): Promise<ReleaseOutlook> {
    const meeting = await getMeetingForNotifications(cityId, meetingId);
    const { notis, email } = await releaseNews(meeting, at);
    const recipients = email.phase && email.outcome.kind !== 'none'
        ? await countEmailRecipientsForMeeting(cityId, meetingId, NEWS_PHASES[email.phase])
        : 0;
    return { notis, email: { ...email, recipients } };
}

/** When a meeting has been released: create the email notifications for the phase that is news. */
export async function notifySubscribersOnRelease(cityId: string, meetingId: string): Promise<void> {
    await guarded(cityId, meetingId, 'release', async () => {
        const meeting = await getMeetingForNotifications(cityId, meetingId);
        // This runs after the response: the admin may have hidden the meeting again.
        if (!meeting.released) return;
        const { email } = await releaseNews(meeting, new Date());
        if (!email.phase || email.outcome.kind === 'none') return;
        await createAndAnnounce(meeting, email.phase, email.outcome.kind === 'sends');
    });
}

/** What a processAgenda or summarize that succeeds now does with email notifications. */
// Caller-gated: the MCP start_task tool authorizes first.
export async function getTaskNotificationOutcome(cityId: string, meetingId: string, phase: NewsPhase): Promise<NotificationOutcome> {
    const now = new Date();
    return notificationOutcome(meetingFacts(await getMeetingForNotifications(cityId, meetingId)), phase, now, now);
}

/**
 * Each phase is judged by when its task last succeeded. At most one phase is
 * news: an agenda before the meeting, a summary after it. Without news, the
 * latest phase explains why: a summary outranks the agenda.
 */
async function releaseNews(meeting: MeetingForNotifications, at: Date): Promise<Pick<ReleaseOutlook, 'notis'> & { email: Omit<ReleaseOutlook['email'], 'recipients'> }> {
    const phases = Object.keys(NEWS_PHASES) as NewsPhase[];
    const completed = await getLastSucceededTaskTimes(meeting.cityId, meeting.id, phases);
    const judged = phases.flatMap((phase) => {
        const taskCompletedAt = completed[phase];
        if (!taskCompletedAt) return [];
        return [{ phase, taskCompletedAt, disposition: classifyMeetingNews({ phase, meetingDate: meeting.dateTime, taskCompletedAt }, at) }];
    });

    const news = judged.find((j) => j.disposition === 'fanout');
    const latest = judged.at(-1);
    const notis: ReleaseOutlook['notis'] = news
        ? { phase: news.phase }
        : { phase: null, reason: (latest?.disposition ?? 'noTasks') as Exclude<NewsDisposition, 'fanout'> | 'noTasks' };

    const released = { ...meetingFacts(meeting), released: true };
    const chosen = news ?? latest;
    if (!chosen) {
        // Nothing processed yet. The body's setting, when it rules email out, is still the first thing to say.
        const outcome = notificationOutcome(released, 'processAgenda', at, at);
        const bodyReason = outcome.kind === 'none' && (outcome.reason === 'noBody' || outcome.reason === 'disabled');
        return { notis, email: { phase: null, outcome: bodyReason ? outcome : { kind: 'none', reason: 'noTasks' } } };
    }
    return { notis, email: { phase: chosen.phase, outcome: notificationOutcome(released, chosen.phase, chosen.taskCompletedAt, at) } };
}

function meetingFacts(meeting: MeetingForNotifications): Parameters<typeof notificationOutcome>[0] {
    return {
        released: meeting.released,
        dateTime: meeting.dateTime,
        scheduleStatus: meeting.scheduleStatus,
        notificationBehavior: meeting.administrativeBody?.notificationBehavior,
    };
}

/**
 * A failure here must not fail the task or the release that triggered it, and
 * nothing retries it: the alert asks an admin to create the notifications by hand.
 */
async function guarded(cityId: string, meetingId: string, what: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        console.error(`Error creating ${what} notifications for ${cityId}/${meetingId}:`, error);
        sendNotificationsFailedAdminAlert({
            cityId,
            meetingId,
            notificationType: what,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function createAndAnnounce(meeting: MeetingForNotifications, phase: NewsPhase, autoSend: boolean): Promise<void> {
    const type = NEWS_PHASES[phase];
    const meetingName = meetingLabelInCity(meeting, 'el');
    const stats = await createNotificationsForMeeting(meeting.cityId, meeting.id, type);
    console.log(`Created ${stats.notificationsCreated} ${type} notifications for ${stats.subjectsTotal} subjects`);

    if (stats.notificationsCreated > 0) {
        sendNotificationsCreatedAdminAlert({
            cityName: meeting.city.name_en,
            meetingName,
            notificationType: type,
            notificationsCreated: stats.notificationsCreated,
            subjectsTotal: stats.subjectsTotal,
            cityId: meeting.cityId,
            meetingId: meeting.id,
            autoSend,
        });
    }

    if (autoSend && stats.notificationIds.length > 0) {
        console.log('Auto-sending notifications...');
        const releaseResult = await releaseNotifications(stats.notificationIds);
        console.log(`Released notifications: ${releaseResult.emailsSent} emails`);

        sendNotificationsSentAdminAlert({
            cityId: meeting.cityId,
            meetingId: meeting.id,
            cityName: meeting.city.name_en,
            meetingName,
            notificationCount: stats.notificationsCreated,
            emailsSent: releaseResult.emailsSent,
            failed: releaseResult.failed,
            leftPending: releaseResult.leftPending,
        });
    }
}
