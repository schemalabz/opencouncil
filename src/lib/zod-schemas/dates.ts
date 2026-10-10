import * as z from 'zod';

const calendarDay = z.iso.date();
// zod follows RFC 3339, which needs seconds when a time has a zone. ISO 8601
// and `new Date()` do not, and the API accepted `…T18:00+03:00` before zod.
const zonedDateTime = z.iso.datetime({ offset: true });
const zonedDateTimeToTheMinute = z.iso.datetime({ offset: true, precision: -1 });
const zonelessDateTime = z.iso.datetime({ local: true });

/**
 * An ISO 8601 date-time in UTC (`Z`), to the minute or to the second. For a
 * field that has always taken UTC only.
 */
export const isoUtcDateTime = () => z.union([z.iso.datetime(), z.iso.datetime({ precision: -1 })]);

/**
 * An ISO 8601 calendar date (`2025-12-31`, a real day), or a date-time with a
 * zone: `Z` or an offset such as `+03:00`. Seconds are optional. A date-time
 * without a zone is refused, because the server would read it in its own
 * zone. `zoneless` also accepts a date-time without a zone, for a reader
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
