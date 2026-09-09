import { z } from 'zod';

/** Page size of the subject listings when the caller names none. */
export const DEFAULT_SUBJECT_LIMIT = 50;
/** Largest page the subject listings serve. */
export const MAX_SUBJECT_LIMIT = 100;

/** `2025-12-31` — a calendar day, with no time of day in it. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A bound of the date range. Both bounds are inclusive, which a date-only
 * upper bound only is if it covers the whole day: `new Date('2025-12-31')` is
 * midnight UTC at the *start* of the 31st, so `lte` against it would drop
 * every meeting held that day. A full timestamp passes through as written.
 */
const dateParam = (label: string, endOfDay = false) => z.string()
    .refine(val => !isNaN(new Date(val).getTime()), { message: `Invalid '${label}' date` })
    .transform(val => new Date(endOfDay && DATE_ONLY.test(val) ? `${val}T23:59:59.999Z` : val));

/**
 * Query parameters of the subject listings. The routes parse
 * `searchParams`, so every field arrives as a string.
 */
export const subjectListQuerySchema = z.object({
    introducerId: z.string().min(1).optional(),
    from: dateParam('from').optional(),
    to: dateParam('to', true).optional(),
    // The whole string must be digits: parseInt alone reads `10abc` as 10 and
    // `1.5` as 1, so malformed input would silently return a page of data
    // instead of the documented validation error.
    limit: z.string()
        .regex(/^\d+$/, { message: `Limit must be a whole number between 1 and ${MAX_SUBJECT_LIMIT}` })
        .optional()
        .transform(val => val ? parseInt(val, 10) : DEFAULT_SUBJECT_LIMIT)
        .refine(val => val >= 1 && val <= MAX_SUBJECT_LIMIT, {
            message: `Limit must be a whole number between 1 and ${MAX_SUBJECT_LIMIT}`,
        }),
    includeUnreleased: z.string()
        .optional()
        .transform(val => val === 'true'),
});

/**
 * The meeting-scoped listing carries the date in its path, so it drops the
 * date range.
 */
export const meetingSubjectListQuerySchema = subjectListQuerySchema.omit({ from: true, to: true });
