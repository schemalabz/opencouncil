import { formatDateAsMeetingId, meetingIdFromCalendarDate } from '../meetingId';

const ATHENS = 'Europe/Athens';
const LAVAL = 'America/Toronto';

describe('formatDateAsMeetingId', () => {
  it('formats a standard date', () => {
    // April 20, 2026 at noon Athens time
    const date = new Date('2026-04-20T12:00:00+03:00');
    expect(formatDateAsMeetingId(date, ATHENS)).toBe('apr20_2026');
  });

  it('formats a single-digit day', () => {
    const date = new Date('2026-04-05T12:00:00+03:00');
    expect(formatDateAsMeetingId(date, ATHENS)).toBe('apr5_2026');
  });

  it('formats December correctly', () => {
    const date = new Date('2026-12-31T12:00:00+02:00');
    expect(formatDateAsMeetingId(date, ATHENS)).toBe('dec31_2026');
  });

  it('uses the given timezone — UTC midnight is still the same day in Athens', () => {
    // Midnight UTC on April 20 is 3:00 AM in Athens (EEST, UTC+3)
    const date = new Date('2026-04-20T00:00:00Z');
    expect(formatDateAsMeetingId(date, ATHENS)).toBe('apr20_2026');
  });

  it('uses the given timezone — late UTC shifts to the next day in Athens', () => {
    // 10 PM UTC on April 19 is 1:00 AM April 20 in Athens (EEST, UTC+3)
    const date = new Date('2026-04-19T22:00:00Z');
    expect(formatDateAsMeetingId(date, ATHENS)).toBe('apr20_2026');
  });

  it('names an evening meeting in Laval by its own day, not the day in Athens', () => {
    // 18:30 EST on 3 November is 01:30 on 4 November in Athens.
    const date = new Date('2026-11-03T18:30:00-05:00');
    expect(formatDateAsMeetingId(date, LAVAL)).toBe('nov3_2026');
    expect(formatDateAsMeetingId(date, ATHENS)).toBe('nov4_2026');
  });

  it('produces the ids of the old Athens formatter for every day of 2026', () => {
    // The ids that exist are persisted. For a Greek city, the city's zone is
    // the zone that the old formatter pinned, so no new id may differ.
    // eslint-disable-next-line no-restricted-syntax -- the formatter this file replaced, pinned to Athens
    const oldFormatter = (date: Date) => date
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ATHENS })
      .toLowerCase()
      .replace(/\s/g, '')
      .replace(',', '_');
    for (let hour = 0; hour < 365 * 24; hour += 5) {
      const date = new Date(Date.UTC(2026, 0, 1, hour));
      expect(formatDateAsMeetingId(date, ATHENS)).toBe(oldFormatter(date));
    }
  });
});

describe('meetingIdFromCalendarDate', () => {
  it('names a calendar date without a time zone', () => {
    expect(meetingIdFromCalendarDate('2026-09-05')).toBe('sep5_2026');
    expect(meetingIdFromCalendarDate('2026-11-03')).toBe('nov3_2026');
  });

  it('refuses a value that is not a calendar date', () => {
    expect(() => meetingIdFromCalendarDate('2026-11-03T18:30:00Z')).toThrow('Not a YYYY-MM-DD calendar date');
    expect(() => meetingIdFromCalendarDate('2026-13-01')).toThrow('Not a YYYY-MM-DD calendar date');
    expect(() => meetingIdFromCalendarDate('2026-02-31')).toThrow('Not a YYYY-MM-DD calendar date');
  });
});
