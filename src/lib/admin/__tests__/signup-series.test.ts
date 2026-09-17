import { dayStart, summarizeSignups, weekStart, type SignupRow } from '../signup-series';

const NOW = new Date('2026-09-09T12:00:00Z'); // a Wednesday; the week starts 2026-09-07
const at = (iso: string) => new Date(iso);

const row = (userId: string, createdAt: string, endedAt: string | null = null, cityIds: string[] = ['athens']): SignupRow => ({
    userId,
    cityIds,
    createdAt: at(createdAt),
    endedAt: endedAt ? at(endedAt) : null,
});

describe('weekStart', () => {
    it('is the Monday of the week, in UTC', () => {
        expect(weekStart(at('2026-09-09T12:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
        expect(weekStart(at('2026-09-13T23:59:59Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
        expect(weekStart(at('2026-09-14T00:00:00Z')).toISOString()).toBe('2026-09-14T00:00:00.000Z');
    });
});

describe('dayStart', () => {
    it('is midnight UTC of the day', () => {
        expect(dayStart(at('2026-09-09T23:59:59Z')).toISOString()).toBe('2026-09-09T00:00:00.000Z');
    });
});

describe('summarizeSignups', () => {
    const rows = [
        row('a', '2026-06-01T10:00:00Z', null, ['athens', 'chania']), // long active
        row('b', '2026-08-25T10:00:00Z', '2026-09-08T09:00:00Z'), // stopped yesterday
        row('c', '2026-09-08T10:00:00Z'), // started yesterday
        row('d', '2026-08-31T10:00:00Z', null, ['chania']), // started nine days ago
    ];

    it('counts the people subscribed now, and the people per municipality', () => {
        const summary = summarizeSignups(rows, NOW);
        expect(summary.people).toBe(3);
        expect(summary.subscribersByCity).toEqual({ athens: 2, chania: 2 });
    });

    it('builds twelve Monday weeks ending on the current one, with the count at each week\'s end', () => {
        const { weeks } = summarizeSignups(rows, NOW);
        expect(weeks).toHaveLength(12);
        expect(weeks[0]).toEqual({ start: '2026-06-22', total: 1 });
        // Last week: a, b and d (c has not started; b stops only this week).
        expect(weeks[10]).toEqual({ start: '2026-08-31', total: 3 });
        // This week: c starts, b stops → a, c, d.
        expect(weeks[11]).toEqual({ start: '2026-09-07', total: 3 });
    });

    it('builds seven UTC days ending on today, with the people who started on each', () => {
        const { days } = summarizeSignups(rows, NOW);
        expect(days).toHaveLength(7);
        expect(days[0].day).toBe('2026-09-03');
        expect(days[5]).toEqual({ day: '2026-09-08', fresh: 1 }); // c
        expect(days[6]).toEqual({ day: '2026-09-09', fresh: 0 }); // today, so far
    });

    it('windows the last 7 days and the 7 before them on the clock, not on weeks', () => {
        const summary = summarizeSignups(rows, NOW);
        expect(summary.newLast7Days).toBe(1); // c (d is nine days old)
        expect(summary.newPrev7Days).toBe(1); // d
        expect(summary.stoppedLast7Days).toBe(1); // b
    });

    it('counts a person on two channels once, from their first subscription', () => {
        const summary = summarizeSignups(
            [row('a', '2026-06-01T10:00:00Z'), row('a', '2026-09-08T10:00:00Z', null, ['chania'])],
            NOW,
        );
        expect(summary.people).toBe(1);
        expect(summary.newLast7Days).toBe(0);
        expect(summary.subscribersByCity).toEqual({ athens: 1, chania: 1 });
    });

    it('keeps a person subscribed while any one of their subscriptions is on', () => {
        const summary = summarizeSignups(
            [row('a', '2026-06-01T10:00:00Z', '2026-09-08T09:00:00Z'), row('a', '2026-06-02T10:00:00Z')],
            NOW,
        );
        expect(summary.people).toBe(1);
        expect(summary.stoppedLast7Days).toBe(0);
    });

    it('is all zeros with no rows', () => {
        const summary = summarizeSignups([], NOW);
        expect(summary.people).toBe(0);
        expect(summary.subscribersByCity).toEqual({});
        expect(summary.weeks.every((w) => w.total === 0)).toBe(true);
        expect(summary.days.every((d) => d.fresh === 0)).toBe(true);
        expect(summary.stoppedLast7Days).toBe(0);
    });
});
