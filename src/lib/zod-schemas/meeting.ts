import { z } from 'zod';

export const meetingSchema = z.object({
    name: z.string().min(2, {
        message: "Meeting name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Meeting name (English) must be at least 2 characters.",
    }),
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
    administrativeBodyId: z.string().optional(),
    processAgenda: z.boolean().optional().default(false),
});

export type MeetingFormData = z.infer<typeof meetingSchema>;
