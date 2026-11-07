import { localCalendarDate } from '@/lib/formatters/time';
import { isCalendarDay } from '@/lib/zod-schemas/dates';

// The months as the old en-US formatter wrote them. The produced strings are
// persisted meeting IDs, so the table must not change.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

/**
 * The meeting ID slug of a calendar date.
 * Example: "2026-04-20" → "apr20_2026"
 */
export function meetingIdFromCalendarDate(day: string): string {
    if (!isCalendarDay(day)) throw new Error(`Not a YYYY-MM-DD calendar date: "${day}"`);
    const [year, month, date] = day.split('-');
    return `${MONTHS[Number(month) - 1]}${Number(date)}_${year}`;
}

/**
 * The meeting ID slug of the day on which `date` falls in `timeZone`. Pass the
 * city's time zone: a meeting at 18:30 in Laval on 3 Nov is already 4 Nov in
 * Athens.
 * Example: 2026-04-20T18:00:00+03:00 in Europe/Athens → "apr20_2026"
 */
export function formatDateAsMeetingId(date: Date, timeZone: string): string {
    return meetingIdFromCalendarDate(localCalendarDate(date, timeZone));
}
