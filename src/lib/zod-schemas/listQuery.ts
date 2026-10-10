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

const limitError = `Limit must be a whole number between 1 and ${MAX_LIST_LIMIT}`;

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
    // The whole string must be digits: parseInt alone reads `10abc` as 10 and
    // `1.5` as 1, so malformed input would silently return a page of data
    // instead of the documented validation error.
    limit: z.string()
        .regex(/^\d*$/, { error: limitError })
        .transform(value => blank(value) ? undefined : parseInt(value, 10))
        .refine(value => value === undefined || (value >= 1 && value <= MAX_LIST_LIMIT), { error: limitError })
        .optional(),
};
