import { EVENT_LOOKBACK_MS } from '@opencouncil/ui/lib/meeting-news';
import { classifyMeetingNews, notificationOutcome } from '../freshness';

const DAY = 24 * 60 * 60_000;
const NOW = new Date('2026-10-20T12:00:00.000Z');
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);

describe('classifyMeetingNews', () => {
    it.each([
        ['processAgenda', 2, 0, 'fanout', 'an agenda for a meeting still ahead'],
        ['processAgenda', -1, 0, 'late-agenda', 'an agenda that arrived after the meeting'],
        ['summarize', -2, 0, 'fanout', 'a summary of a recent meeting'],
        ['summarize', 2, 0, 'future-summary', 'a summary of a meeting not yet held'],
        ['summarize', -20, 0, 'stale', 'a summary of a meeting older than the stale window'],
        ['processAgenda', 30, -8, 'old-task', 'an agenda processed before the lookback window'],
        ['summarize', -3, -8, 'old-task', 'a summary that completed before the lookback window'],
    ] as const)('%s, meeting %i days away, task %i days away: %s (%s)', (phase, meetingDays, taskDays, expected, _case) => {
        const disposition = classifyMeetingNews(
            { phase, meetingDate: daysFromNow(meetingDays), taskCompletedAt: daysFromNow(taskDays) },
            NOW,
        );
        expect(disposition).toBe(expected);
    });

    it('keeps a task completed exactly EVENT_LOOKBACK_MS ago, as the Notis query does (completedAt >= now - lookback)', () => {
        const meetingDate = daysFromNow(3);
        const at = (offset: number) => new Date(NOW.getTime() - EVENT_LOOKBACK_MS + offset);
        expect(classifyMeetingNews({ phase: 'processAgenda', meetingDate, taskCompletedAt: at(0) }, NOW)).toBe('fanout');
        expect(classifyMeetingNews({ phase: 'processAgenda', meetingDate, taskCompletedAt: at(-1) }, NOW)).toBe('old-task');
    });
});

describe('notificationOutcome', () => {
    const meeting = (over: Partial<Parameters<typeof notificationOutcome>[0]> = {}) => ({
        released: true,
        dateTime: daysFromNow(3),
        scheduleStatus: 'scheduled' as const,
        notificationBehavior: 'NOTIFICATIONS_AUTO' as const,
        ...over,
    });

    it.each([
        ['no body', meeting({ notificationBehavior: null }), 'processAgenda', { kind: 'none', reason: 'noBody' }],
        ['a disabled body', meeting({ notificationBehavior: 'NOTIFICATIONS_DISABLED' }), 'processAgenda', { kind: 'none', reason: 'disabled' }],
        ['a draft', meeting({ released: false }), 'processAgenda', { kind: 'none', reason: 'unreleased' }],
        ['a cancelled meeting, agenda', meeting({ scheduleStatus: 'cancelled' }), 'processAgenda', { kind: 'none', reason: 'not-taking-place' }],
        ['a cancelled meeting, summary', meeting({ scheduleStatus: 'cancelled', dateTime: daysFromNow(-2) }), 'summarize', { kind: 'sends' }],
        ['a past meeting, agenda', meeting({ dateTime: daysFromNow(-1) }), 'processAgenda', { kind: 'none', reason: 'late-agenda' }],
        ['a fresh agenda, AUTO', meeting(), 'processAgenda', { kind: 'sends' }],
        ['a fresh agenda, APPROVAL', meeting({ notificationBehavior: 'NOTIFICATIONS_APPROVAL' }), 'processAgenda', { kind: 'waitsForApproval' }],
        ['a date sent as a string', meeting({ dateTime: daysFromNow(3).toISOString() }), 'processAgenda', { kind: 'sends' }],
    ] as const)('%s', (_case, facts, phase, expected) => {
        expect(notificationOutcome(facts, phase, NOW, NOW)).toEqual(expected);
    });
});
