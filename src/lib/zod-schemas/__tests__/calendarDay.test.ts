import { isCalendarDay } from '@/lib/zod-schemas/dates';

describe('isCalendarDay', () => {
    it.each(['2026-01-01', '2024-02-29', '1970-01-01'])('accepts %p', (value) => {
        expect(isCalendarDay(value)).toBe(true);
    });

    // The pattern alone would accept the impossible days.
    it.each(['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-10'])('rejects the impossible day %p', (value) => {
        expect(isCalendarDay(value)).toBe(false);
    });

    it.each(['', 'abc', '2026-1-1', '2026-01-01T00:00:00Z', '01/02/2026', null, undefined])('rejects %p', (value) => {
        expect(isCalendarDay(value)).toBe(false);
    });
});
