import { isPolledOnItsOwn } from '../decisionEligibility';
import { MAX_POLLING_DAYS, MEETING_POLL_DELAY_DAYS } from '@/lib/tasks/pollDecisionsBackoff';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-03-20T12:00:00Z');
const daysBefore = (days: number) => new Date(now.getTime() - days * DAY_MS);

type Meeting = Parameters<typeof isPolledOnItsOwn>[0];

function meeting(overrides: Partial<Meeting> = {}): Meeting {
    return {
        dateTime: daysBefore(5),
        scheduleStatus: 'scheduled',
        kind: 'ordinary',
        continuationOf: null,
        city: { diavgeiaUid: '6104', status: 'supported' },
        ...overrides,
    };
}

describe('isPolledOnItsOwn', () => {
    it('is true for a held meeting that takes decisions, in the window, of a customer city on Diavgeia', () => {
        expect(isPolledOnItsOwn(meeting(), now)).toBe(true);
    });

    it('holds the window of the cron, both ends included', () => {
        expect(isPolledOnItsOwn(meeting({ dateTime: daysBefore(MEETING_POLL_DELAY_DAYS) }), now)).toBe(true);
        expect(isPolledOnItsOwn(meeting({ dateTime: new Date(daysBefore(MEETING_POLL_DELAY_DAYS).getTime() + 1) }), now)).toBe(false);
        expect(isPolledOnItsOwn(meeting({ dateTime: daysBefore(MAX_POLLING_DAYS) }), now)).toBe(true);
        expect(isPolledOnItsOwn(meeting({ dateTime: new Date(daysBefore(MAX_POLLING_DAYS).getTime() - 1) }), now)).toBe(false);
    });

    it('is false for a city with no Diavgeia unit', () => {
        expect(isPolledOnItsOwn(meeting({ city: { diavgeiaUid: null, status: 'supported' } }), now)).toBe(false);
    });

    it.each(['pending', 'demo'] as const)('is false for a %s city, which is not a customer', (status) => {
        expect(isPolledOnItsOwn(meeting({ city: { diavgeiaUid: '6104', status } }), now)).toBe(false);
    });

    it('is false for a meeting that takes no decisions, and for a later part of one', () => {
        expect(isPolledOnItsOwn(meeting({ kind: 'accountability' }), now)).toBe(false);
        expect(isPolledOnItsOwn(meeting({ kind: null, continuationOf: { kind: 'activityReport' } }), now)).toBe(false);
        expect(isPolledOnItsOwn(meeting({ kind: null, continuationOf: { kind: 'ordinary' } }), now)).toBe(true);
    });

    it.each(['cancelled', 'postponed'] as const)('is false for a %s meeting', (scheduleStatus) => {
        expect(isPolledOnItsOwn(meeting({ scheduleStatus }), now)).toBe(false);
    });
});
