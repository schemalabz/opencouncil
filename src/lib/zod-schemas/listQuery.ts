import * as z from 'zod';
import type { DateBound } from '@/lib/dates/dayBounds';
import { ISO_DATE_OR_DATE_TIME_RULE, isCalendarDay, isIsoDateOrDateTime } from './dates';

/** Largest page that a list endpoint serves. */
export const MAX_LIST_LIMIT = 100;

// A query field that the caller sends empty (`?to=`) is absent: a client that
// builds `?to=${x ?? ''}` means "no bound". Every list query field below
// treats `''` this way.
const blank = (value: string) => value === '';

/**
 * A bound of the date range, inclusive at both ends. A date-time is an
 * instant. A date-only value stays a calendar day, because its start and its
 * end depend on the time zone of the city, which the schema does not know:
 * resolveCityDateRange reads it there.
 */
const dateBound = (label: string) => z.string()
    .refine(value => blank(value) || isIsoDateOrDateTime(value), { error: `Invalid '${label}' date` })
    .transform((value): DateBound | undefined => {
        if (blank(value)) return undefined;
        return isCalendarDay(value) ? { kind: 'day', day: value } : { kind: 'instant', at: new Date(value) };
    })
    .optional();

/**
 * A whole number from 1 up to `max`, read from a query string; undefined when
 * the caller names none. The whole string must be digits: parseInt alone reads
 * `10abc` as 10 and `1.5` as 1, so malformed input would silently return a
 * page of data instead of the documented validation error.
 */
const wholeNumberField = (error: string, max = Number.MAX_SAFE_INTEGER) => z.string()
    .regex(/^\d*$/, { error })
    .transform(value => blank(value) ? undefined : parseInt(value, 10))
    .refine(value => value === undefined || (value >= 1 && value <= max), { error })
    .optional();

/** How the date bounds read, for the OpenAPI description of each list. */
export const DATE_BOUND_RULE = `${ISO_DATE_OR_DATE_TIME_RULE} A date with no time of day covers the whole day in the time zone of the city.`;

/**
 * Query fields of the list endpoints, which parse `searchParams`, so every
 * field arrives as a string. `limit` is undefined when the caller names none;
 * each endpoint picks its own default.
 */
export const listQueryFields = {
    from: dateBound('from'),
    to: dateBound('to'),
    limit: wholeNumberField(`Limit must be a whole number between 1 and ${MAX_LIST_LIMIT}`, MAX_LIST_LIMIT),
};

/**
 * Query fields of a paged list. `page` counts from 1. Both are undefined when
 * the caller names none; each list picks its own defaults.
 */
export const pageQueryFields = {
    page: wholeNumberField('Page must be a whole number from 1'),
    pageSize: wholeNumberField(`Page size must be a whole number between 1 and ${MAX_LIST_LIMIT}`, MAX_LIST_LIMIT),
};

/**
 * The page fields of a JSON request (a POST body, an MCP tool call): numbers,
 * not strings. Each caller sets its own default and its own page size limit.
 */
export const jsonPageFields = {
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
};

/**
 * Where a paged response stands. The search API, the admin notifications and
 * the paged MCP tools return it.
 */
export const paginationSchema = z.object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

export type Pagination = z.infer<typeof paginationSchema>;

// A page URL is typed by hand and shared, so a bad page number opens the first
// page rather than an error.
const lenientPage = pageQueryFields.page.catch(undefined);

/** The page a page URL names: 1 when the value is missing or not a whole number from 1. */
export function readPageParam(raw: string | null | undefined): number {
    return lenientPage.parse(raw ?? undefined) ?? 1;
}

/** How many pages `total` rows fill: 0 for no rows, as a paged response reports it. */
export function totalPagesOf(total: number, pageSize: number): number {
    return Math.ceil(total / pageSize);
}

/** The page to show: the requested one, the last page past the end, and 1 when there are no rows. */
export function clampPage(requested: number, total: number, pageSize: number): number {
    return Math.min(Math.max(1, requested), Math.max(1, totalPagesOf(total, pageSize)));
}

/** The rows of one page of a list held in memory. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
    return items.slice((page - 1) * pageSize, page * pageSize);
}

/** The pagination of a paged response. */
export function paginationOf(total: number, page: number, pageSize: number): Pagination {
    return { total, page, pageSize, totalPages: totalPagesOf(total, pageSize) };
}
