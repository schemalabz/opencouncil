/** @jest-environment node */

import { isPastMeetingForNotifications, NOTIFICATION_MAX_MEETING_AGE_DAYS } from '@/lib/notifications/pastMeeting';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-16T12:00:00Z');

describe('isPastMeetingForNotifications', () => {
    it('is false for a meeting ahead, today, or inside the window', () => {
        expect(isPastMeetingForNotifications(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe(false);
        expect(isPastMeetingForNotifications(NOW, NOW)).toBe(false);
        expect(isPastMeetingForNotifications(new Date(NOW.getTime() - (NOTIFICATION_MAX_MEETING_AGE_DAYS - 1) * DAY), NOW)).toBe(false);
    });

    it('is true for a meeting older than the window: a backfilled meeting notifies nobody', () => {
        expect(isPastMeetingForNotifications(new Date(NOW.getTime() - (NOTIFICATION_MAX_MEETING_AGE_DAYS + 1) * DAY), NOW)).toBe(true);
        expect(isPastMeetingForNotifications(new Date('2024-03-12T18:00:00Z'), NOW)).toBe(true);
    });
});
