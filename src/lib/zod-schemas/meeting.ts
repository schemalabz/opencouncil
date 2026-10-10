import * as z from 'zod';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { OFFERED_FORMATS, SCHEDULE_STATUS_REASON_MAX_LENGTH } from '@/lib/meetingLifecycleRules';
import { webUrl } from './primitives';
import { ISO_DATE_OR_DATE_TIME_RULE, isoDateOrDateTime } from './dates';
import { includeUnreleasedQuery } from './subject';
import { DATE_BOUND_RULE, listQueryFields, MAX_LIST_LIMIT } from './listQuery';
import { vmsg } from './messages';

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

/** Optional free text that an empty string clears. */
const blankToNull = (field: z.ZodString) => field
    .nullable()
    .optional()
    .transform(val => (val === '' ? null : val));

/**
 * Field rules of a meeting, shared by the REST routes and the MCP meeting
 * tools. Each caller decides how a field is optional and how a blank clears
 * it: REST takes `""`, MCP takes null.
 *
 * The date, youtubeUrl and format messages are plain English, as is the
 * meetingId message of meetingSchema: meetingFormSchema replaces those four
 * fields, so only an API caller or an agent reads them.
 */
export const baseMeetingFields = {
    name: z.string().min(2, {
        error: vmsg('meetingNameMin2'),
    }),
    name_en: z.string().min(2, {
        error: vmsg('meetingNameEnMin2'),
    }),
    date: isoDateOrDateTime({ error: 'Invalid date/time format' })
        .meta({ description: `Date and time of the meeting. ${ISO_DATE_OR_DATE_TIME_RULE}`, example: '2026-10-05T18:00:00+03:00' }),
    youtubeUrl: webUrl({
        error: 'Invalid YouTube URL.',
    }),
    agendaUrl: webUrl({
        error: vmsg('invalidAgendaUrl'),
    }),
    administrativeBodyId: z.string().min(1),

    // The facts of the record (MEETING_RECORD_INPUT_KEYS) and the link to the
    // postponed meeting that a new meeting replaces.
    kind: z.enum(MeetingKind),
    sessionNumber: z.number().int().positive(),
    scheduleStatus: z.enum(MeetingScheduleStatus),
    scheduleStatusReason: z.string().trim().max(SCHEDULE_STATUS_REASON_MAX_LENGTH),
    // By circulation waits for its page, as in the form.
    format: z.enum(OFFERED_FORMATS, {
        error: `The format is one of ${OFFERED_FORMATS.join(', ')}. A meeting by circulation cannot be set yet.`,
    }),
    closedToPublic: z.boolean(),
    place: z.string().trim().max(200),
    postponedFromId: z.string().min(1),
};

export const meetingSchema = z.object({
    name: nameOverride(vmsg('meetingNameMin2')),
    name_en: nameOverride(vmsg('meetingNameEnMin2')),
    date: baseMeetingFields.date.transform((str) => new Date(str)),
    youtubeUrl: baseMeetingFields.youtubeUrl.optional().or(z.literal("")),
    agendaUrl: baseMeetingFields.agendaUrl.optional().or(z.literal("")),
    // Optional on create: when omitted, the POST handler auto-generates a
    // unique ID from the meeting date. The PUT handler identifies the meeting
    // by the URL path param and ignores this field.
    meetingId: z.string().min(1, {
        error: 'Meeting ID must not be empty.',
    }).optional(),
    administrativeBodyId: baseMeetingFields.administrativeBodyId.nullable().optional().or(z.literal("")),
    processAgenda: z.boolean().optional().default(false),

    // The lifecycle of the meeting. An omitted field keeps its value on
    // update. On create the database defaults apply: the kind and the format
    // stay null until somebody states them or reads them from the invitation.
    kind: baseMeetingFields.kind.nullable().optional(),
    scheduleStatus: baseMeetingFields.scheduleStatus.optional(),
    scheduleStatusReason: blankToNull(baseMeetingFields.scheduleStatusReason),
    sessionNumber: baseMeetingFields.sessionNumber.nullable().optional(),
    format: baseMeetingFields.format.nullable().optional(),
    closedToPublic: baseMeetingFields.closedToPublic.optional(),
    place: blankToNull(baseMeetingFields.place),
    postponedFromId: baseMeetingFields.postponedFromId.nullable().optional(),
    continuationOfId: z.string().min(1).nullable().optional(),
});

/**
 * Query parameters of GET /meetings. The route parses `searchParams`, so
 * every field arrives as a string. With no limit, the list has no page size.
 */
export const meetingListQuerySchema = z.object({
    limit: listQueryFields.limit
        .meta({ description: `Maximum number of meetings to return (1-${MAX_LIST_LIMIT})`, example: '10' }),
    from: listQueryFields.from
        .meta({ description: `Earliest meeting date and time, inclusive. ${DATE_BOUND_RULE}`, example: '2025-01-01' }),
    to: listQueryFields.to
        .meta({
            description: `Latest meeting date and time, inclusive. ${DATE_BOUND_RULE}`,
            example: '2025-12-31',
        }),
    includeUnreleased: includeUnreleasedQuery,
});

// Frontend form schema (React Hook Form). The form picks the day in a calendar
// and types the time apart, so it sends `date` as one ISO string built from
// both. The form ticks processAgenda through its defaultValues: the API leaves
// it off, so that a caller opts in. meetingRequestFields
// (src/components/meetings/meetingFormRequest.ts) turns the lifecycle inputs
// into the request.
export const meetingFormSchema = meetingSchema.extend({
    date: z.date({
        error: vmsg('meetingDateRequired'),
    }),
    time: z.string({
        error: vmsg('meetingTimeRequired'),
    }),
    youtubeUrl: webUrl({
        error: vmsg('invalidMediaUrl'),
    }).optional().or(z.literal("")),
    // Empty on create: the API makes the id from the date and adds _2, _3 when
    // the day already has a meeting. A typed id is sent as it is.
    meetingId: z.string().optional(),
    // The form always holds these. Null is «Από την πρόσκληση».
    kind: baseMeetingFields.kind.nullable(),
    scheduleStatus: baseMeetingFields.scheduleStatus,
    closedToPublic: baseMeetingFields.closedToPublic,
    // The form holds the stored format, by circulation too, and does not send
    // back a format that no form offers.
    format: z.enum(MeetingFormat).nullable(),
    // A text input. The request sends it as a number.
    sessionNumber: z.string().regex(/^\s*(\d*)\s*$/, { error: vmsg('sessionNumberWholeNumber') })
        .refine(val => val.trim() === '' || Number(val) >= 1, { error: vmsg('sessionNumberMin1') })
        .optional(),
});
