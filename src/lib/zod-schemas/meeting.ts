import * as z from 'zod';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { OFFERED_FORMATS, SCHEDULE_STATUS_REASON_MAX_LENGTH } from '@/lib/meetingLifecycleRules';

/** Free text that an empty string clears. */
const optionalText = (max: number) => z.string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform(val => (val === '' ? null : val));

// The name of a meeting is derived (src/lib/meetingName.ts), so the schema
// has no name fields. z.object strips a `name` or `name_en` that a client
// still sends: the request succeeds and writes no name.
export const meetingSchema = z.object({
    date: z.string()
        .refine(val => !isNaN(new Date(val).getTime()), {
            error: "Invalid date/time format"
        })
        .transform((str) => new Date(str)),
    youtubeUrl: z.url({
        error: "Invalid YouTube URL.",
    }).optional().or(z.literal("")),
    agendaUrl: z.url({
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
    // Urgency is not a kind: any kind can be urgent, on every body.
    urgent: z.boolean().optional(),
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

export type MeetingFormData = z.infer<typeof meetingSchema>;
