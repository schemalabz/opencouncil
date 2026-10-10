import "server-only";
import { getCityTimezone } from '@/lib/db/cityTimezone';
import { DEFAULT_TIMEZONE } from '@/lib/formatters/time';
import { isCalendarDay } from '@/lib/zod-schemas/dates';
import { dayRangeToInstants, hasDayBound, resolveDateRange, type DateRangeBounds } from './dayBounds';

/**
 * A date range of a city's list, with each calendar day read in the city's
 * time zone. A meeting at 00:00 Athens time on 26 February is stored as 22:00Z
 * on the 25th, so the UTC day would list it under the wrong date.
 *
 * Reads City.timezone only when a bound is a day. For a city that does not
 * exist, the list is empty in any zone.
 */
export async function resolveCityDateRange(cityId: string, range: DateRangeBounds): Promise<{ from?: Date; to?: Date }> {
    if (!hasDayBound(range)) return resolveDateRange(range, DEFAULT_TIMEZONE);
    return resolveDateRange(range, await getCityTimezone(cityId) ?? DEFAULT_TIMEZONE);
}

/**
 * A search date range, with each calendar day read in the time zone of the
 * searched city. A search over more than one city reads its days in
 * DEFAULT_TIMEZONE, as the landing map does. A date-time passes unchanged.
 */
export async function resolveSearchDayRange(cityIds: string[], range: { start: string; end: string }): Promise<{ start: string; end: string }> {
    if (!isCalendarDay(range.start) && !isCalendarDay(range.end)) return range;
    const timeZone = cityIds.length === 1 ? await getCityTimezone(cityIds[0]) : null;
    return dayRangeToInstants(range, timeZone ?? DEFAULT_TIMEZONE);
}
