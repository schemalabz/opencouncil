import { z } from 'zod';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { AGENDA_TEXT_MAX_LENGTH, OFFERED_FORMATS, SCHEDULE_STATUS_REASON_MAX_LENGTH } from '@/lib/meetingLifecycleRules';

/**
 * A name override. The name of a meeting is derived (src/lib/meetingName.ts),
 * so the override is optional: an empty string or null clears it, and an
 * omitted field leaves it as it is.
 */
const nameOverride = (message: string) => z.string()
    .trim()
    .refine(val => val === '' || val.length >= 2, { message })
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
    date: z.string()
        .refine(val => !isNaN(new Date(val).getTime()), {
            message: "Invalid date/time format"
        })
        .transform((str) => new Date(str)),
    youtubeUrl: z.string().url({
        message: "Invalid YouTube URL.",
    }).optional().or(z.literal("")),
    agendaUrl: z.string().url({
        message: "Invalid Agenda URL.",
    }).optional().or(z.literal("")),
    // Optional on create: when omitted, the POST handler auto-generates a
    // unique ID from the meeting date. The PUT handler identifies the meeting
    // by the URL path param and ignores this field.
    meetingId: z.string().min(1, {
        message: "Meeting ID must not be empty.",
    }).optional(),
    // On PUT, an absent body leaves the meeting's body as it is, and null or
    // an empty string clears it. On POST, absent and null both mean no body.
    administrativeBodyId: z.string().nullable().optional(),
    processAgenda: z.boolean().optional().default(false),

    // The lifecycle of the meeting. An omitted field keeps its value on
    // update. On create the database defaults apply: the kind and the format
    // stay null until somebody states them or reads them from the invitation.
    kind: z.nativeEnum(MeetingKind).nullable().optional(),
    scheduleStatus: z.nativeEnum(MeetingScheduleStatus).optional(),
    scheduleStatusReason: optionalText(SCHEDULE_STATUS_REASON_MAX_LENGTH),
    sessionNumber: z.number().int().positive().nullable().optional(),
    // By circulation waits for its page, as in the form and MCP.
    format: z.nativeEnum(MeetingFormat)
        .refine((format) => OFFERED_FORMATS.includes(format), { message: 'A meeting by circulation cannot be set yet.' })
        .nullable().optional(),
    closedToPublic: z.boolean().optional(),
    noRecording: z.boolean().optional(),
    place: optionalText(200),
    // The agenda as pasted text, for a body that has no PDF (#829). The app
    // extracts the subjects from it after the write; see lib/agendaText.ts.
    agendaText: z.string().trim().max(AGENDA_TEXT_MAX_LENGTH).nullable().optional().transform(val => (val === '' ? null : val)),
    postponedFromId: z.string().min(1).nullable().optional(),
    continuationOfId: z.string().min(1).nullable().optional(),
});

export type MeetingFormData = z.infer<typeof meetingSchema>;
