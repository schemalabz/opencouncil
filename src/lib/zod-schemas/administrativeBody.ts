import { z } from 'zod';
import { AdministrativeBodyType, DocumentKind, NotificationBehavior } from '@prisma/client';
import { decisionConventionsSchema } from '@/lib/decisionConventions';
import { parseChannelRef } from '@/lib/utils/youtube';
import { DOCUMENT_KINDS, type DocumentSendRule } from '@/lib/documents/settings';

export const administrativeBodyTypeSchema = z.nativeEnum(AdministrativeBodyType);
export const notificationBehaviorSchema = z.nativeEnum(NotificationBehavior);

// Field rules of an administrative body — validation only, no defaults.
// Shared by the body form, the body routes, and the city import
// (zod-schemas/cityPopulation.ts).
export const baseAdministrativeBodyFields = {
    name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Name (English) must be at least 2 characters.",
    }),
    type: administrativeBodyTypeSchema,
};

// pollLivestreams can only use a URL that parseChannelRef resolves, so reject
// any other URL here (a /c/ vanity URL, a playlist, a search results page).
const youtubeChannelUrlValue = z.string().url({
    message: "Must be a valid URL.",
}).refine(val => parseChannelRef(val) !== null, {
    message: "Must be a YouTube channel URL: https://www.youtube.com/@handle or https://www.youtube.com/channel/UC…",
});
const youtubeChannelUrl = z.union([youtubeChannelUrlValue, z.literal('')])
    .optional().transform(val => val === '' ? undefined : val);

// One document of the "Αποστολή Εγγράφων" section, as the routes receive it.
// An enabled document needs somebody to send it to.
export const documentSendSettingInputSchema = z.object({
    document: z.nativeEnum(DocumentKind),
    enabled: z.boolean(),
    recipientEmails: z.array(z.string().email()),
}).refine(setting => !setting.enabled || setting.recipientEmails.length > 0, {
    message: 'An enabled document needs at least one recipient',
    path: ['recipientEmails'],
});

export type DocumentSendSettingInput = z.infer<typeof documentSendSettingInputSchema>;

// JSON body of POST /administrative-bodies and PUT /administrative-bodies/{bodyId}
export const administrativeBodySchema = z.object({
    ...baseAdministrativeBodyFields,
    youtubeChannelUrl,
    // Absent: the settings of the body stay as they are
    documentSendSettings: z.array(documentSendSettingInputSchema).optional(),
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

// JSON body of PUT /administrative-bodies/{bodyId} from an admin of the body,
// who may change the YouTube channel and the document send settings, and no
// other field (#828). An absent field stays as it is. An empty string or null
// clears the channel.
export const administrativeBodyContactsSchema = z.object({
    youtubeChannelUrl: z.union([youtubeChannelUrlValue, z.literal(''), z.null()])
        .optional()
        .transform(val => val === '' ? null : val),
    documentSendSettings: z.array(documentSendSettingInputSchema).optional(),
});

const emailSchema = z.string().email();

/** A comma-separated CC list, as the form holds it, split into addresses. */
export function splitEmailList(value: string): string[] {
    return value.split(',').map(email => email.trim()).filter(email => email !== '');
}

// One card of the "Αποστολή Εγγράφων" section: the switch, the To address and
// the comma-separated CC list. The addresses are checked whenever they are
// typed; a To address is required only for a document that is switched on.
export const documentSendCardSchema = z.object({
    enabled: z.boolean(),
    to: z.string().trim(),
    cc: z.string(),
}).superRefine((card, ctx) => {
    if (card.enabled && card.to === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Enter the address that receives the document' });
    } else if (card.to !== '' && !emailSchema.safeParse(card.to).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Must be a valid email address' });
    }
    if (!splitEmailList(card.cc).every(email => emailSchema.safeParse(email).success)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cc'], message: 'All entries must be valid email addresses' });
    }
});

export type DocumentSendCard = z.infer<typeof documentSendCardSchema>;

export const documentSendCardsSchema = z.object(
    Object.fromEntries(DOCUMENT_KINDS.map(document => [document, documentSendCardSchema])) as Record<DocumentKind, typeof documentSendCardSchema>,
);

export type DocumentSendCards = z.infer<typeof documentSendCardsSchema>;

/** The cards of the form from the stored settings; a document with no row is off and empty. */
export function documentSendCardsFromSettings(settings: Array<DocumentSendRule & { document: DocumentKind }> | undefined): DocumentSendCards {
    const cards = {} as DocumentSendCards;
    for (const document of DOCUMENT_KINDS) {
        const setting = settings?.find(s => s.document === document);
        const [to = '', ...cc] = setting?.recipientEmails ?? [];
        cards[document] = { enabled: setting?.enabled ?? false, to, cc: cc.join(', ') };
    }
    return cards;
}

/** The request body of the routes from the cards of the form. */
export function documentSendSettingsFromCards(cards: DocumentSendCards): DocumentSendSettingInput[] {
    return DOCUMENT_KINDS.map(document => {
        const card = cards[document];
        return {
            document,
            enabled: card.enabled,
            recipientEmails: [...(card.to.trim() ? [card.to.trim()] : []), ...splitEmailList(card.cc)],
        };
    });
}

// Frontend form schema (React Hook Form).
export const administrativeBodyFormSchema = z.object({
    ...baseAdministrativeBodyFields,
    youtubeChannelUrl,
    documentSendSettings: documentSendCardsSchema,
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
