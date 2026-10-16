/**
 * A past meeting notifies nobody (#876): a backfilled meeting from years ago
 * reaches summarize like any other, and its subjects are not news. The rule
 * is pure, so the notification creator and its test share it.
 */

/** A meeting older than this creates no citizen notifications, whatever its body says. */
export const NOTIFICATION_MAX_MEETING_AGE_DAYS = 30;

export function isPastMeetingForNotifications(dateTime: Date, now: Date = new Date()): boolean {
    return now.getTime() - dateTime.getTime() > NOTIFICATION_MAX_MEETING_AGE_DAYS * 24 * 60 * 60 * 1000;
}
