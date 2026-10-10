import * as z from 'zod';
import { AdministrativeBodyType, NotificationBehavior } from '@prisma/client';
import { decisionConventionsSchema } from '@/lib/decisionConventions';
import { parseChannelRef } from '@/lib/utils/youtube';

export const administrativeBodyTypeSchema = z.enum(AdministrativeBodyType);
export const notificationBehaviorSchema = z.enum(NotificationBehavior);

// Field rules of an administrative body — validation only, no defaults.
// Shared by the body form, the body routes, and the city import
// (zod-schemas/cityPopulation.ts).
export const baseAdministrativeBodyFields = {
    name: z.string().min(2, {
        error: "Name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        error: "Name (English) must be at least 2 characters.",
    }),
    type: administrativeBodyTypeSchema,
};

// pollLivestreams can only use a URL that parseChannelRef resolves, so reject
// any other URL here (a /c/ vanity URL, a playlist, a search results page).
const youtubeChannelUrl = z.union([
    z.url({
        error: "Must be a valid URL.",
    }).refine(val => parseChannelRef(val) !== null, {
        error: "Must be a YouTube channel URL: https://www.youtube.com/@handle or https://www.youtube.com/channel/UC…",
    }),
    z.literal('')
]).optional().transform(val => val === '' ? undefined : val);

// JSON body of POST /administrative-bodies and PUT /administrative-bodies/{bodyId}
export const administrativeBodySchema = z.object({
    ...baseAdministrativeBodyFields,
    youtubeChannelUrl,
    contactEmails: z.array(z.email()).optional(),
    notificationBehavior: notificationBehaviorSchema.optional(),
    showUnreviewedTranscript: z.boolean().optional(),
    // The hall where the body meets as a rule. An empty string clears it.
    place: z.string().trim().max(200).optional().transform(val => (val === '' ? null : val)),
    // Comma-separated in the request, an array in the database
    diavgeiaUnitIds: z.string().optional().transform(val => {
        if (!val || val.trim() === '') return [];
        return val.split(',').map(s => s.trim()).filter(Boolean);
    }),
});

// Frontend form schema (React Hook Form). The form edits the contact emails as
// a primary address plus a comma-separated CC list, and joins them on submit.
export const administrativeBodyFormSchema = z.object({
    ...baseAdministrativeBodyFields,
    youtubeChannelUrl,
    contactEmailPrimary: z.union([
        z.email({ error: "Must be a valid email address" }),
        z.literal('')
    ]).optional().transform(val => val === '' ? undefined : val),
    contactEmailsCC: z.string().optional().refine(val => {
        if (!val || val.trim() === '') return true;
        const emails = val.split(',').map(e => e.trim()).filter(e => e !== '');
        const emailSchema = z.email();
        return emails.every(email => emailSchema.safeParse(email).success);
    }, { error: "All entries must be valid email addresses" }),
    notificationBehavior: notificationBehaviorSchema,
    place: z.string().max(200).optional(),
    showUnreviewedTranscript: z.boolean(),
    diavgeiaUnitIds: z.string().optional().transform(val => val === '' ? undefined : val),
    // Edited through its own fields and written by its own Confirm button, not
    // by this form's submit. Held as the parsed record, so the fields and the
    // Confirm handler take a typed value rather than an unchecked one.
    decisionConventions: decisionConventionsSchema.nullable(),
});

export type AdministrativeBodyFormValues = z.infer<typeof administrativeBodyFormSchema>;
export type AdministrativeBodyFormInput = z.input<typeof administrativeBodyFormSchema>;
