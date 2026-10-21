import type { MeetingScheduleStatus, NotificationBehavior, NotificationType } from '@prisma/client';
import { takesPlace } from '@/lib/meetingLifecycleRules';
import { notificationsEnabled } from './behavior';
import {
    classifyEvent,
    EVENT_LOOKBACK_MS,
    STALE_MEETING_MS,
    type EventDisposition,
    type MeetingNewsPhase,
} from '@opencouncil/ui/lib/meeting-news';

/**
 * When a meeting is news to its email subscribers: the rule that Notis
 * follows for WhatsApp (`@opencouncil/ui/lib/meeting-news`), with the task
 * lookback that Notis applies in its event query.
 */

export type NewsPhase = MeetingNewsPhase;

export function isNewsPhase(type: string): type is NewsPhase {
    return Object.hasOwn(NEWS_PHASES, type);
}

/** The notification that tells of each phase. */
export const NEWS_PHASES = {
    processAgenda: 'beforeMeeting',
    summarize: 'afterMeeting',
} as const satisfies Record<NewsPhase, NotificationType>;

/** `old-task`: the task completed before EVENT_LOOKBACK_MS, so Notis does not see it either. */
export type NewsDisposition = EventDisposition | 'old-task';

export function classifyMeetingNews(
    event: { phase: NewsPhase; meetingDate: Date; taskCompletedAt: Date },
    at: Date,
): NewsDisposition {
    // Notis selects the events with completedAt >= now - EVENT_LOOKBACK_MS.
    if (event.taskCompletedAt.getTime() < at.getTime() - EVENT_LOOKBACK_MS) return 'old-task';
    return classifyEvent(
        { type: event.phase, meetingDate: event.meetingDate },
        at,
        new Date(at.getTime() - STALE_MEETING_MS),
    );
}

/** Why a task or a release creates no email notifications. */
export type NotificationSkipReason =
    | 'noBody'
    | 'disabled'
    | 'unreleased'
    | 'not-taking-place'
    // A release of a meeting that no processAgenda or summarize task covers yet.
    | 'noTasks'
    | Exclude<NewsDisposition, 'fanout'>;

/**
 * What the email notifications of one phase do: none (and why), sent at once,
 * or left for an admin to approve. The task callbacks act on it, and the
 * release, the release dialog, the review dialog, the task buttons and the
 * MCP start_task tool all describe it, so none of them can promise what the
 * others do not do. Pure: the browser computes it from the meeting it has.
 */
export type NotificationOutcome =
    | { kind: 'none'; reason: NotificationSkipReason }
    | { kind: 'sends' }
    | { kind: 'waitsForApproval' };

export function notificationOutcome(
    meeting: {
        released: boolean;
        // A string once the meeting has crossed to the browser.
        dateTime: Date | string;
        scheduleStatus: MeetingScheduleStatus;
        notificationBehavior: NotificationBehavior | null | undefined;
    },
    phase: NewsPhase,
    taskCompletedAt: Date,
    at: Date,
): NotificationOutcome {
    if (!meeting.notificationBehavior) return { kind: 'none', reason: 'noBody' };
    if (!notificationsEnabled(meeting.notificationBehavior)) return { kind: 'none', reason: 'disabled' };
    if (!meeting.released) return { kind: 'none', reason: 'unreleased' };
    // releaseNotifications skips a beforeMeeting email for such a meeting, so
    // none is created. Notis does not check it.
    if (phase === 'processAgenda' && !takesPlace(meeting)) return { kind: 'none', reason: 'not-taking-place' };
    const disposition = classifyMeetingNews({ phase, meetingDate: new Date(meeting.dateTime), taskCompletedAt }, at);
    if (disposition !== 'fanout') return { kind: 'none', reason: disposition };
    return meeting.notificationBehavior === 'NOTIFICATIONS_AUTO' ? { kind: 'sends' } : { kind: 'waitsForApproval' };
}
