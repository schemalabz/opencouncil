import { cumulativeByWeek, lastTwoWeeks, weekStart } from '../signup-series';

const NOW = new Date('2026-09-09T12:00:00Z'); // a Wednesday; the week starts 2026-09-07
const at = (iso: string) => new Date(iso);

describe('weekStart', () => {
    it('is the Monday of the week, in UTC', () => {
        expect(weekStart(at('2026-09-09T12:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
        expect(weekStart(at('2026-09-13T23:59:59Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
        expect(weekStart(at('2026-09-14T00:00:00Z')).toISOString()).toBe('2026-09-14T00:00:00.000Z');
    });
});

describe('cumulativeByWeek', () => {
    it('gives the running total at the end of each of the last twelve weeks', () => {
        const dates = [at('2026-06-01T00:00:00Z'), at('2026-08-31T10:00:00Z'), at('2026-09-08T10:00:00Z')];
        const weeks = cumulativeByWeek(dates, NOW);
        expect(weeks).toHaveLength(12);
        expect(weeks[0]).toEqual({ start: '2026-06-22', total: 1 });
        expect(weeks[10]).toEqual({ start: '2026-08-31', total: 2 });
        expect(weeks[11]).toEqual({ start: '2026-09-07', total: 3 });
    });
});

describe('lastTwoWeeks', () => {
    it('windows on the clock: the last 7 days and the 7 before them', () => {
        const dates = [at('2026-09-08T10:00:00Z'), at('2026-08-31T10:00:00Z'), at('2026-08-01T00:00:00Z')];
        expect(lastTwoWeeks(dates, NOW)).toEqual({ last7Days: 1, prev7Days: 1 });
    });
});
