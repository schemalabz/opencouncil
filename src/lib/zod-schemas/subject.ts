import * as z from 'zod';
import { NonAgendaReason } from '@prisma/client';
import { stringBoolean } from './primitives';
import { DATE_BOUND_RULE, listQueryFields, MAX_LIST_LIMIT } from './listQuery';

/** Page size of the subject listings when the caller names none. */
export const DEFAULT_SUBJECT_LIMIT = 50;
/** Largest page the subject listings serve. */
export const MAX_SUBJECT_LIMIT = MAX_LIST_LIMIT;

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
    from: listQueryFields.from.meta({
        description: `Earliest meeting date, inclusive. ${DATE_BOUND_RULE}`,
        example: '2025-01-01',
    }),
    to: listQueryFields.to.meta({
        description: `Latest meeting date, inclusive. ${DATE_BOUND_RULE}`,
        example: '2025-12-31',
    }),
    limit: listQueryFields.limit.default(DEFAULT_SUBJECT_LIMIT).meta({
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
