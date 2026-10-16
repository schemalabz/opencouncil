// The shared Prisma shapes of the document sends (#874): the selects of the
// queries in src/lib/db/documentSends.ts and the types derived from them.
import type { Prisma } from '@prisma/client';
import { publicAdministrativeBodyRelation, type AdministrativeBodyWithSettings } from './administrativeBody';

export const documentSendSettingSelect = {
    document: true,
    enabled: true,
    enabledAt: true,
    recipientEmails: true,
} satisfies Prisma.DocumentSendSettingSelect;

export type DocumentSendSettingRow = Prisma.DocumentSendSettingGetPayload<{ select: typeof documentSendSettingSelect }>;

export const documentSendSummarySelect = {
    id: true,
    document: true,
    status: true,
    trigger: true,
    automatic: true,
    recipientEmails: true,
    complete: true,
    missingSubjectIds: true,
    sentAt: true,
    failureReason: true,
    createdAt: true,
} satisfies Prisma.DocumentSendSelect;

/** One send as the admin pages show it. */
export type DocumentSendSummary = Prisma.DocumentSendGetPayload<{ select: typeof documentSendSummarySelect }>;

// The payload builders read the name of the body, never its settings.
export const documentMeetingInclude = {
    administrativeBody: publicAdministrativeBodyRelation,
    city: true,
} satisfies Prisma.CouncilMeetingInclude;

/** The meeting as the document payload builders read it. */
export type DocumentMeeting = Prisma.CouncilMeetingGetPayload<{ include: typeof documentMeetingInclude }>;

export type DocumentSendClaim = Pick<
    Prisma.DocumentSendUncheckedCreateInput,
    'cityId' | 'councilMeetingId' | 'document' | 'trigger' | 'automatic' | 'recipientEmails' | 'complete' | 'missingSubjectIds'
>;

export const administrativeBodyWithSendSettingsInclude = {
    documentSendSettings: { select: documentSendSettingSelect },
} satisfies Prisma.AdministrativeBodyInclude;

/** A body with its "Αποστολή Εγγράφων" settings, as the body form edits it. */
export type AdministrativeBodyWithSendSettings = Omit<
    Prisma.AdministrativeBodyGetPayload<{ include: typeof administrativeBodyWithSendSettingsInclude }>,
    'decisionConventions'
> & Pick<AdministrativeBodyWithSettings, 'decisionConventions'>;
