import * as z from 'zod';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { SCHEDULE_STATUS_REASON_MAX_LENGTH } from '@/lib/meetingLifecycleRules';
import { blankToNull, webUrl } from './primitives';
import { ISO_DATE_OR_DATE_TIME_RULE, isoDateOrDateTime } from './dates';
import { includeUnreleasedQuery } from './subject';
import { DATE_BOUND_RULE, listQueryFields, MAX_LIST_LIMIT } from './listQuery';
import { vmsg } from './messages';

/**
 * The largest session number that a meeting takes. A session number has at
 * most three digits, as scripts/meeting-lifecycle-apply.ts also reads it.
 */
export const MAX_SESSION_NUMBER = 999;

/**
 * Field rules of a meeting, shared by the REST routes and the MCP meeting
 * tools. Each caller decides how a field is optional and how a blank clears
 * it: REST takes `""`, MCP takes null.
 *
 * The date and youtubeUrl messages are plain English, as is the meetingId
 * message of meetingSchema: meetingFormSchema replaces those three fields, so
 * only an API caller or an agent reads them.
 */
export const baseMeetingFields = {
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
    // postponed meeting that a new meeting replaces. The descriptions hold
    // for every realm. The OpenAPI spec and the MCP tools add what their
    // readers need.
    kind: z.enum(MeetingKind)
        .meta({ description: 'The kind of the meeting, as the invitation states it. Every kind except ordinary belongs to a council only.' }),
    urgent: z.boolean()
        .meta({ description: 'The meeting was convened urgently. Urgency is not a kind: any kind can be urgent, on every body.' }),
    sessionNumber: z.number().int().positive().max(MAX_SESSION_NUMBER)
        .meta({ description: 'The official number of the meeting, as the municipality prints it. Not unique.' }),
    scheduleStatus: z.enum(MeetingScheduleStatus)
        .meta({ description: 'Whether the meeting takes place. A postponed or cancelled meeting stays public with its status.' }),
    scheduleStatusReason: z.string().trim().max(SCHEDULE_STATUS_REASON_MAX_LENGTH)
        .meta({ description: 'Why the meeting was postponed or cancelled, as the municipality says it.' }),
    format: z.enum(MeetingFormat)
        .meta({ description: 'How the meeting takes place. A meeting by circulation has a written vote and no recording.' }),
    closedToPublic: z.boolean()
        .meta({ description: 'The council decided to meet behind closed doors. The meeting is still recorded and transcribed.' }),
    place: z.string().trim().max(200)
        .meta({ description: 'Where the meeting takes place, when it is not the usual hall of its body.' }),
    postponedFromId: z.string().min(1)
        .meta({ description: 'The id of the postponed meeting that this meeting replaces.' }),
};

// The name of a meeting is derived (src/lib/meetingName.ts), so the schema
// has no name fields. z.object strips a `name` or `name_en` that a client
// still sends: the request succeeds and writes no name.
export const meetingSchema = z.object({
    date: baseMeetingFields.date.transform((str) => new Date(str)),
    youtubeUrl: blankToNull(baseMeetingFields.youtubeUrl.or(z.literal(''))),
    agendaUrl: blankToNull(baseMeetingFields.agendaUrl.or(z.literal(''))),
    // Optional on create: when omitted, the POST handler auto-generates a
    // unique ID from the meeting date. The PUT handler identifies the meeting
    // by the URL path param and ignores this field.
    meetingId: z.string().min(1, {
        error: 'Meeting ID must not be empty.',
    }).optional(),
    // On PUT, an absent body leaves the meeting's body as it is, and null or
    // an empty string clears it. On POST, absent and null both mean no body.
    administrativeBodyId: baseMeetingFields.administrativeBodyId.nullable().optional().or(z.literal("")),
    processAgenda: z.boolean().optional().default(false),

    // The lifecycle of the meeting. An omitted field keeps its value on
    // update. On create the database defaults apply: the kind and the format
    // stay null until somebody states them or reads them from the invitation.
    kind: baseMeetingFields.kind.nullable().optional(),
    urgent: baseMeetingFields.urgent.optional(),
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
    // The time input holds HH:MM, and an empty one holds ''.
    time: z.string({
        error: vmsg('meetingTimeRequired'),
    }).regex(/^\d{2}:\d{2}$/, { error: vmsg('meetingTimeRequired') }),
    youtubeUrl: webUrl({
        error: vmsg('invalidMediaUrl'),
    }).optional().or(z.literal("")),
    // The inputs hold text. The request reads an empty one as a clear.
    agendaUrl: baseMeetingFields.agendaUrl.optional().or(z.literal('')),
    // Empty on create: the API makes the id from the date and adds _2, _3 when
    // the day already has a meeting. A typed id is sent as it is.
    meetingId: z.string().optional(),
    // The form always holds these. Null is «Από την πρόσκληση».
    kind: baseMeetingFields.kind.nullable(),
    urgent: baseMeetingFields.urgent,
    scheduleStatus: baseMeetingFields.scheduleStatus,
    closedToPublic: baseMeetingFields.closedToPublic,
    format: baseMeetingFields.format.nullable(),
    // A text input. The request sends it as a number.
    sessionNumber: z.string().regex(/^\s*(\d*)\s*$/, { error: vmsg('sessionNumberWholeNumber') })
        .refine(val => val.trim() === '' || Number(val) >= 1, { error: vmsg('sessionNumberMin1') })
        .refine(val => val.trim() === '' || Number(val) <= MAX_SESSION_NUMBER, { error: vmsg('sessionNumberMax999') })
        .optional(),
});
