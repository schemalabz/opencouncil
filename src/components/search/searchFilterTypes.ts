import { endOfDay, format, isValid, parseISO, startOfDay } from "date-fns";

/** Filter state, exactly as it is carried in the URL. */
export type SearchFilterParams = {
    cityId?: string;
    partyId?: string;
    personId?: string;
    adminBodyType?: string;
    adminBodyId?: string;
    /** Comma-separated topic ids. */
    topicIds?: string;
    /** yyyy-MM-dd. */
    dateFrom?: string;
    dateTo?: string;
};

export type FilterPatch = Partial<Record<keyof SearchFilterParams, string | undefined>>;

/** Whether any filter is currently set — drives the filter button's active (dot) state. */
export function hasActiveSearchFilters(filters: SearchFilterParams): boolean {
    return Boolean(
        filters.cityId || filters.partyId || filters.personId ||
        filters.adminBodyType || filters.adminBodyId ||
        filters.topicIds || filters.dateFrom
    );
}

/**
 * The date filter travels in the URL as a bare calendar day (`yyyy-MM-dd`) with
 * no timezone, which is what the user picked off a calendar. The three helpers
 * below are the only places that convert it, so writing, reading and querying
 * all agree on which day that string names.
 *
 * The rule: a calendar day is LOCAL. `parseISO` honours that; `new Date(str)`
 * does not — the language spec reads a date-only string as UTC midnight, so
 * anywhere west of Greenwich the value read back is the previous day. Writing
 * with `format()` (local) and reading with `new Date()` (UTC) shifts the date
 * one day earlier on every round trip for those users.
 */
const FILTER_DATE_FORMAT = "yyyy-MM-dd";

/** Parse a `yyyy-MM-dd` filter param as local midnight of that calendar day. */
export function parseFilterDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const date = parseISO(value);
    return isValid(date) ? date : undefined;
}

/** Format a date picked off the calendar into the URL's calendar-day form. */
export function formatFilterDate(date: Date): string {
    return format(date, FILTER_DATE_FORMAT);
}

/**
 * The UTC instants that bound the local calendar days `[dateFrom, dateTo]`, for
 * the Elasticsearch `meeting_date` range. An open end repeats the start, so a
 * half-picked range means that single day.
 *
 * Bounding on local day edges matters: a meeting held at 21:00 local on the
 * last day of the range is already the next day in UTC, and a range built from
 * naive `${day}T00:00:00Z` / `${day}T23:59:59Z` strings would drop it.
 *
 * The two days are ordered before use. The picker cannot produce an end before
 * a start, but a hand-edited URL can, and passing that straight through built a
 * reversed range that matched nothing while the pill still read as a period —
 * zero results with nothing on screen to explain them.
 */
export function filterDateRangeToInstants(
    dateFrom: string | undefined,
    dateTo: string | undefined
): { start: string; end: string } | undefined {
    const from = parseFilterDate(dateFrom);
    if (!from) return undefined;
    const to = parseFilterDate(dateTo) ?? from;
    const [earlier, later] = from <= to ? [from, to] : [to, from];
    return {
        start: startOfDay(earlier).toISOString(),
        end: endOfDay(later).toISOString(),
    };
}
