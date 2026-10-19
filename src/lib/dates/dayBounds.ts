import { fromZonedTime } from 'date-fns-tz';
import { isCalendarDay } from '@/lib/zod-schemas/dates';

/**
 * One end of a date range as a caller wrote it. A calendar day has no instant
 * of its own: where it starts and ends depends on the time zone of the reader,
 * so it stays a day until `resolveDateRange` gets that zone.
 */
export type DateBound = { kind: 'day'; day: string } | { kind: 'instant'; at: Date };

export interface DateRangeBounds {
    from?: DateBound;
    to?: DateBound;
}

export function hasDayBound({ from, to }: DateRangeBounds): boolean {
    return from?.kind === 'day' || to?.kind === 'day';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The first and the last millisecond of a calendar day (`YYYY-MM-DD`) in an
 * IANA time zone. A day across a DST change has 23 or 25 hours, so the end is
 * the start of the next day minus one millisecond, not the start plus 24 hours.
 */
export function dayBounds(day: string, timeZone: string): { start: Date; end: Date } {
    const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
    return {
        start: fromZonedTime(`${day}T00:00:00`, timeZone),
        end: new Date(fromZonedTime(`${nextDay}T00:00:00`, timeZone).getTime() - 1),
    };
}

/**
 * An inclusive range of instants. A day as `from` starts at the start of that
 * day, and a day as `to` runs to the end of that day, both in `timeZone`.
 */
export function resolveDateRange({ from, to }: DateRangeBounds, timeZone: string): { from?: Date; to?: Date } {
    return {
        from: from && (from.kind === 'day' ? dayBounds(from.day, timeZone).start : from.at),
        to: to && (to.kind === 'day' ? dayBounds(to.day, timeZone).end : to.at),
    };
}

/**
 * A range of ISO strings, with each calendar day read in `timeZone`: a day as
 * the start begins at the start of that day, and a day as the end runs to the
 * end of that day. A date-time passes unchanged, because its reader decides
 * its zone.
 */
export function dayRangeToInstants(range: { start: string; end: string }, timeZone: string): { start: string; end: string } {
    return {
        start: isCalendarDay(range.start) ? dayBounds(range.start, timeZone).start.toISOString() : range.start,
        end: isCalendarDay(range.end) ? dayBounds(range.end, timeZone).end.toISOString() : range.end,
    };
}
