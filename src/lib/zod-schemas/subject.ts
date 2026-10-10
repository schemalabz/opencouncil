import * as z from 'zod';
import { NonAgendaReason } from '@prisma/client';
import { isCalendarDay } from '@/lib/utils/date';
import { isoDateOrDateTime, stringBoolean } from './primitives';

/** Page size of the subject listings when the caller names none. */
export const DEFAULT_SUBJECT_LIMIT = 50;
/** Largest page the subject listings serve. */
export const MAX_SUBJECT_LIMIT = 100;

/**
 * A bound of the date range. Both bounds are inclusive, which a date-only
 * upper bound only is if it covers the whole day: `new Date('2025-12-31')` is
 * midnight UTC at the *start* of the 31st, so `lte` against it would drop
 * every meeting held that day. A full timestamp passes through as written.
 * A date-only value must be a real day: `new Date('2026-02-31')` rolls over to
 * 3 March, so a parse check alone would accept it and search the wrong day.
 */
const dateParam = (label: string, endOfDay = false) => isoDateOrDateTime({ error: `Invalid '${label}' date` })
    .transform(val => new Date(endOfDay && isCalendarDay(val) ? `${val}T23:59:59.999Z` : val));

/**
 * Whether a listing includes unreleased content. The routes that take it
 * authorize the caller before they read with it.
 */
export const includeUnreleasedQuery = stringBoolean.default(false).meta({
    description: 'Include unreleased meetings and their subjects, and a city that is not published. '
        + 'Requires an authorized session for the city, or a service key.',
    example: 'true',
});

/**
 * Query parameters of the subject listings. The routes parse
 * `searchParams`, so every field arrives as a string.
 */
export const subjectListQuerySchema = z.object({
    introducerId: z.string().min(1).optional().meta({ description: 'Return only subjects introduced by this person.' }),
    from: dateParam('from').optional().meta({
        description: 'Earliest meeting date, inclusive (ISO 8601).',
        example: '2025-01-01',
    }),
    to: dateParam('to', true).optional().meta({
        description: 'Latest meeting date, inclusive (ISO 8601). A date with no time of day covers the whole day.',
        example: '2025-12-31',
    }),
    // The whole string must be digits: parseInt alone reads `10abc` as 10 and
    // `1.5` as 1, so malformed input would silently return a page of data
    // instead of the documented validation error.
    limit: z.string()
        .regex(/^\d+$/, { error: `Limit must be a whole number between 1 and ${MAX_SUBJECT_LIMIT}` })
        .optional()
        .transform(val => val ? parseInt(val, 10) : DEFAULT_SUBJECT_LIMIT)
        .refine(val => val >= 1 && val <= MAX_SUBJECT_LIMIT, {
            error: `Limit must be a whole number between 1 and ${MAX_SUBJECT_LIMIT}`,
        })
        .meta({
            description: `Maximum number of subjects to return (1-${MAX_SUBJECT_LIMIT}). Defaults to ${DEFAULT_SUBJECT_LIMIT}.`,
            example: '20',
        }),
    includeUnreleased: includeUnreleasedQuery,
});

/**
 * The meeting-scoped listing carries the date in its path, so it drops the
 * date range.
 */
export const meetingSubjectListQuerySchema = subjectListQuerySchema.omit({ from: true, to: true });

/** Query parameters of a single subject. */
export const subjectQuerySchema = subjectListQuerySchema.pick({ includeUnreleased: true });

/**
 * JSON body of PATCH /subjects/{subjectId}: the agenda flags of a subject.
 * Strict, so a misspelt flag is a 400 rather than a write that does nothing.
 */
export const subjectAgendaFlagsSchema = z.strictObject({
    nonAgendaReason: z.enum(NonAgendaReason).nullable().optional(),
    withdrawn: z.boolean().optional(),
});
