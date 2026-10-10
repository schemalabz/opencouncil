import * as z from 'zod';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { OFFERED_FORMATS, SCHEDULE_STATUS_REASON_MAX_LENGTH } from '@/lib/meetingLifecycleRules';
import { isoDateOrDateTime, webUrl } from './primitives';
import { includeUnreleasedQuery } from './subject';

/**
 * A name override. The name of a meeting is derived (src/lib/meetingName.ts),
 * so the override is optional: an empty string or null clears it, and an
 * omitted field leaves it as it is.
 */
const nameOverride = (message: string) => z.string()
    .trim()
    .refine(val => val === '' || val.length >= 2, { error: message })
    .nullable()
    .optional()
    .transform(val => (val === '' ? null : val));

/** Free text that an empty string clears. */
const optionalText = (max: number) => z.string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform(val => (val === '' ? null : val));

export const meetingSchema = z.object({
    name: nameOverride("Meeting name must be at least 2 characters."),
    name_en: nameOverride("Meeting name (English) must be at least 2 characters."),
    date: isoDateOrDateTime({ error: "Invalid date/time format" })
        .transform((str) => new Date(str)),
    youtubeUrl: webUrl({
        error: "Invalid YouTube URL.",
    }).optional().or(z.literal("")),
    agendaUrl: webUrl({
        error: "Invalid Agenda URL.",
    }).optional().or(z.literal("")),
    // Optional on create: when omitted, the POST handler auto-generates a
    // unique ID from the meeting date. The PUT handler identifies the meeting
    // by the URL path param and ignores this field.
    meetingId: z.string().min(1, {
        error: "Meeting ID must not be empty.",
    }).optional(),
    administrativeBodyId: z.string().nullable().optional(),
    processAgenda: z.boolean().optional().default(false),

    // The lifecycle of the meeting. An omitted field keeps its value on
    // update. On create the database defaults apply: the kind and the format
    // stay null until somebody states them or reads them from the invitation.
    kind: z.enum(MeetingKind).nullable().optional(),
    scheduleStatus: z.enum(MeetingScheduleStatus).optional(),
    scheduleStatusReason: optionalText(SCHEDULE_STATUS_REASON_MAX_LENGTH),
    sessionNumber: z.number().int().positive().nullable().optional(),
    // By circulation waits for its page, as in the form and MCP.
    format: z.enum(MeetingFormat)
        .refine((format) => OFFERED_FORMATS.includes(format), { error: 'A meeting by circulation cannot be set yet.' })
        .nullable().optional(),
    closedToPublic: z.boolean().optional(),
    place: optionalText(200),
    postponedFromId: z.string().min(1).nullable().optional(),
    continuationOfId: z.string().min(1).nullable().optional(),
});

/**
 * Query parameters of GET /meetings. The route parses `searchParams`, so
 * every field arrives as a string.
 */
export const meetingListQuerySchema = z.object({
    limit: z.string()
        .optional()
        .transform((val) => val ? parseInt(val, 10) : undefined)
        .refine((val) => val === undefined || (!isNaN(val) && val >= 1 && val <= 100), {
            error: "Limit must be a number between 1 and 100"
        })
        .meta({ description: 'Maximum number of meetings to return (1-100)', example: '10' }),
    from: z.string()
        .optional()
        .refine((val) => !val || !isNaN(new Date(val).getTime()), { error: "Invalid 'from' date" })
        .transform((val) => val ? new Date(val) : undefined)
        .meta({ description: 'Earliest meeting date and time, inclusive.', example: '2025-01-01' }),
    to: z.string()
        .optional()
        .refine((val) => !val || !isNaN(new Date(val).getTime()), { error: "Invalid 'to' date" })
        .transform((val) => val ? new Date(val) : undefined)
        .meta({ description: 'Latest meeting date and time, inclusive.', example: '2025-12-31T23:59:59Z' }),
    includeUnreleased: includeUnreleasedQuery,
});

export type MeetingFormData = z.infer<typeof meetingSchema>;
