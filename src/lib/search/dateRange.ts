import type { SearchRequest } from './types';

/** The earliest start a date filter can name: before any recorded meeting. */
const OPEN_RANGE_START = '1970-01-01';

/**
 * A search date range from two optional bounds, for a caller whose reader may
 * set either bound alone. Undefined when neither is set. A missing start opens
 * the range to every earlier meeting.
 *
 * A missing end is the caller's to choose, because the surfaces differ on
 * purpose: the map stops at the current moment, as its own endpoints do, and
 * the MCP tool includes the whole of today. The search reads a date-only end
 * as the end of that day in the city's zone (resolveSearchDayRange), so
 * `2026-10-08` includes a meeting at 23:30 Athens time on that day.
 */
export function openDateRange(
    from: string | null | undefined,
    to: string | null | undefined,
    openEnd: string
): SearchRequest['dateRange'] {
    if (!from && !to) return undefined;
    return { start: from || OPEN_RANGE_START, end: to || openEnd };
}
