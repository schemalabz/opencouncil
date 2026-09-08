import { formatWeekdayDateTime } from '../time';

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
