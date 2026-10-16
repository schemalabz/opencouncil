import * as z from 'zod';
import { AdministrativeBodyType, NotificationBehavior } from '@prisma/client';
import { decisionConventionsRecordSchema, decisionConventionsSchema } from '@/lib/decisionConventions';
import { parseChannelRef } from '@/lib/utils/youtube';
import { blankToNull, webUrl } from './primitives';
import { vmsg } from './messages';

export const administrativeBodyTypeSchema = z.enum(AdministrativeBodyType);
export const notificationBehaviorSchema = z.enum(NotificationBehavior);

// Field rules of an administrative body — validation only, no defaults.
// Shared by the body form, the body routes, and the city import
// (zod-schemas/cityPopulation.ts).
export const baseAdministrativeBodyFields = {
    name: z.string().min(2, {
        error: vmsg('bodyNameMin2'),
    }),
    name_en: z.string().min(2, {
        error: vmsg('bodyNameEnMin2'),
    }),
    type: administrativeBodyTypeSchema,
};

// pollLivestreams can only use a URL that parseChannelRef resolves, so reject
// any other URL here (a /c/ vanity URL, a playlist, a search results page).
// webUrl first: parseChannelRef reads a value without a slash as a bare handle.
const youtubeChannelUrlValue = webUrl({
    error: vmsg('invalidUrl'),
}).refine(val => parseChannelRef(val) !== null, {
    error: vmsg('youtubeChannelUrl'),
});
// In a request, an absent channel stays as it is. An empty string or null clears it.
const youtubeChannelUrlRequest = blankToNull(z.union([youtubeChannelUrlValue, z.literal('')]));

// JSON body of POST /administrative-bodies and PUT /administrative-bodies/{bodyId}.
// On PUT, an absent field stays as it is.
export const administrativeBodySchema = z.object({
    ...baseAdministrativeBodyFields,
    youtubeChannelUrl: youtubeChannelUrlRequest,
    notificationBehavior: notificationBehaviorSchema.optional(),
    showUnreviewedTranscript: z.boolean().optional(),
    // The hall where the body meets as a rule. An empty string clears it.
    place: blankToNull(z.string().trim().max(200)),
    // Comma-separated in the request, an array in the database. An empty string clears it.
    diavgeiaUnitIds: z.string().optional().transform(val => val?.split(',').map(s => s.trim()).filter(Boolean)),
});

// JSON body of PUT /administrative-bodies/{bodyId} from an admin of the body,
// who may change the YouTube channel and no other field (#828).
export const administrativeBodyContactsSchema = z.object({
    youtubeChannelUrl: youtubeChannelUrlRequest,
});

// JSON body of PUT /administrative-bodies/{bodyId} that confirms the decision
// conventions of the body. It carries only the conventions.
export const confirmConventionsRequestSchema = z.object({
    confirmConventions: z.literal(true),
    decisionConventions: decisionConventionsSchema,
});

// JSON body of PUT /administrative-bodies/{bodyId} from an admin of the city:
// an update of the body, or a confirmation of its conventions. confirmConventions selects the variant,
// so the issues of a failed confirmation have paths under decisionConventions.
export const updateAdministrativeBodyRequestSchema = z.discriminatedUnion('confirmConventions', [
    confirmConventionsRequestSchema,
    administrativeBodySchema.extend({ confirmConventions: z.literal(false).optional() }),
]);

// Frontend form schema (React Hook Form).
export const administrativeBodyFormSchema = z.object({
    ...baseAdministrativeBodyFields,
    // Sent as it is: the request reads an empty field as a clear.
    youtubeChannelUrl: z.union([youtubeChannelUrlValue, z.literal('')]).optional(),
    notificationBehavior: notificationBehaviorSchema,
    place: z.string().max(200).optional(),
    showUnreviewedTranscript: z.boolean(),
    diavgeiaUnitIds: z.string().optional(),
    // Edited through its own fields and written by its own Confirm button, not
    // by this form's submit. Held as the parsed record, so the fields and the
    // Confirm handler take a typed value rather than an unchecked one.
    decisionConventions: decisionConventionsRecordSchema.nullable(),
});

export type AdministrativeBodyFormOutput = z.output<typeof administrativeBodyFormSchema>;
export type AdministrativeBodyFormInput = z.input<typeof administrativeBodyFormSchema>;
