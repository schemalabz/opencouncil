import { formatWeekdayDateTime, formatCalendarDate, localCalendarDate } from '@/lib/formatters/time';

describe('formatWeekdayDateTime', () => {
    const tz = 'Europe/Athens';

    it('gives a Greek weekday the article its gender takes', () => {
        expect(formatWeekdayDateTime(new Date('2026-02-11T13:00:00Z'), tz, 'el')).toBe('την Τετάρτη 11 Φεβρουαρίου 2026 στις 15:00');
        expect(formatWeekdayDateTime(new Date('2026-02-09T13:00:00Z'), tz, 'el')).toBe('τη Δευτέρα 9 Φεβρουαρίου 2026 στις 15:00');
        expect(formatWeekdayDateTime(new Date('2026-02-14T13:00:00Z'), tz, 'el')).toBe('το Σάββατο 14 Φεβρουαρίου 2026 στις 15:00');
        expect(formatWeekdayDateTime(new Date('2026-02-15T13:00:00Z'), tz, 'el')).toBe('την Κυριακή 15 Φεβρουαρίου 2026 στις 15:00');
    });

    it('adds no article in other languages', () => {
        expect(formatWeekdayDateTime(new Date('2026-02-14T13:00:00Z'), tz, 'en')).toBe('Saturday February 14, 2026 at 15:00');
    });
});

describe('formatCalendarDate', () => {
    it('formats a bare date-only string', () => {
        expect(formatCalendarDate('2026-07-24', 'el')).toBe('24 Ιουλ 2026');
    });

    it('renders the calendar date localCalendarDate produced for a late-evening instant', () => {
        // 21:30 UTC is already the 25th in Athens. The pair has to agree, or the
        // page prints the day before the one the city published on.
        const published = new Date('2026-07-24T21:30:00.000Z');
        expect(localCalendarDate(published, 'Europe/Athens')).toBe('2026-07-25');
        expect(formatCalendarDate(localCalendarDate(published, 'Europe/Athens'), 'el')).toBe('25 Ιουλ 2026');
    });

    it('fails loudly on a UTC instant instead of printing its UTC day', () => {
        // The old body sliced the first ten characters, which turned this
        // instant into a plausible '24 Ιουλ 2026' that nobody could catch.
        expect(formatCalendarDate('2026-07-24T21:30:00.000Z', 'el')).toMatch(/Invalid Date/i);
    });
});
