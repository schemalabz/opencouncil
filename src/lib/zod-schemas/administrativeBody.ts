import * as z from 'zod';
import { AdministrativeBodyType, DocumentKind, NotificationBehavior } from '@prisma/client';
import { decisionConventionsRecordSchema, decisionConventionsSchema } from '@/lib/decisionConventions';
import { parseChannelRef } from '@/lib/utils/youtube';
import { DOCUMENT_KINDS, type DocumentSendRule } from '@/lib/documents/settings';
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

// One document of the "Αποστολή Εγγράφων" section, as the routes receive it.
// An enabled document needs somebody to send it to.
export const documentSendSettingInputSchema = z.object({
    document: z.enum(DocumentKind),
    enabled: z.boolean(),
    recipientEmails: z.array(z.email()),
}).refine(setting => !setting.enabled || setting.recipientEmails.length > 0, {
    error: 'An enabled document needs at least one recipient',
    path: ['recipientEmails'],
});

export type DocumentSendSettingInput = z.infer<typeof documentSendSettingInputSchema>;

// JSON body of POST /administrative-bodies and PUT /administrative-bodies/{bodyId}.
// On PUT, an absent field stays as it is.
export const administrativeBodySchema = z.object({
    ...baseAdministrativeBodyFields,
    youtubeChannelUrl: youtubeChannelUrlRequest,
    // Absent: the settings of the body stay as they are
    documentSendSettings: z.array(documentSendSettingInputSchema).optional(),
    notificationBehavior: notificationBehaviorSchema.optional(),
    showUnreviewedTranscript: z.boolean().optional(),
    // The hall where the body meets as a rule. An empty string clears it.
    place: blankToNull(z.string().trim().max(200)),
    // Comma-separated in the request, an array in the database. An empty string clears it.
    diavgeiaUnitIds: z.string().optional().transform(val => val?.split(',').map(s => s.trim()).filter(Boolean)),
});

// JSON body of PUT /administrative-bodies/{bodyId} from an admin of the body,
// who may change the YouTube channel and the document send settings, and no
// other field (#828, #874).
export const administrativeBodyContactsSchema = z.object({
    youtubeChannelUrl: youtubeChannelUrlRequest,
    documentSendSettings: z.array(documentSendSettingInputSchema).optional(),
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

const emailSchema = z.email();

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
        ctx.addIssue({ code: 'custom', path: ['to'], message: vmsg('documentRecipientRequired') });
    } else if (card.to !== '' && !emailSchema.safeParse(card.to).success) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: vmsg('invalidEmail') });
    }
    if (!splitEmailList(card.cc).every(email => emailSchema.safeParse(email).success)) {
        ctx.addIssue({ code: 'custom', path: ['cc'], message: vmsg('invalidEmailList') });
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
    // Sent as it is: the request reads an empty field as a clear.
    youtubeChannelUrl: z.union([youtubeChannelUrlValue, z.literal('')]).optional(),
    documentSendSettings: documentSendCardsSchema,
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
