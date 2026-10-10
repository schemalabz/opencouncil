import * as z from 'zod';

const calendarDay = z.iso.date();
// zod follows RFC 3339, which needs seconds when a time has a zone. ISO 8601
// and `new Date()` do not, and the API accepted `…T18:00+03:00` before zod.
const zonedDateTime = z.iso.datetime({ offset: true });
const zonedDateTimeToTheMinute = z.iso.datetime({ offset: true, precision: -1 });
const zonelessDateTime = z.iso.datetime({ local: true });

/**
 * Whether a value is a real calendar day written as `2025-12-31`, with no time
 * of day in it. `2026-02-31` has the shape but is not a day.
 */
export function isCalendarDay(value: string | null | undefined): value is string {
    return calendarDay.safeParse(value).success;
}

/** The text of the rule below, for the OpenAPI description of each field that uses it. */
export const ISO_DATE_OR_DATE_TIME_RULE = 'An ISO 8601 date (2026-04-15), or a date-time with a zone: '
    + '`Z` or an offset such as `+03:00` (2026-04-15T18:00+03:00). Seconds are optional. '
    + 'A date-time without a zone is refused, because the server would read it in its own zone.';

/**
 * An ISO 8601 calendar date or date-time, as ISO_DATE_OR_DATE_TIME_RULE
 * states. `zoneless` also accepts a date-time without a zone, for a reader
 * that reads it in a fixed zone: Elasticsearch reads it as UTC.
 *
 * A union of zod's formats, so the JSON Schema of the API spec, the MCP tools
 * and the City Creator prompt names `date` and `date-time`. A failure is one
 * `invalid_union` issue with the given message.
 */
export const isoDateOrDateTime = (params?: { error?: string; zoneless?: boolean }) => z.union(
    params?.zoneless
        ? [calendarDay, zonedDateTime, zonedDateTimeToTheMinute, zonelessDateTime]
        : [calendarDay, zonedDateTime, zonedDateTimeToTheMinute],
    { error: params?.error },
);

const strictIsoDateOrDateTime = isoDateOrDateTime();

/** Whether a value passes ISO_DATE_OR_DATE_TIME_RULE. */
export function isIsoDateOrDateTime(value: string): boolean {
    return strictIsoDateOrDateTime.safeParse(value).success;
}
