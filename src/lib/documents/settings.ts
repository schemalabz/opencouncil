// Pure rules of the document send settings. The body form, the review dialog
// and the sender read them, so this module must stay free of server-only imports.
import { DocumentKind } from '@prisma/client';
import type { DocumentSendSettingRow } from '@/lib/db/types/documentSend';

/**
 * The minutes go out no later than this many calendar days after the meeting,
 * complete or not. The team chose 5 days in the review of #887: the back
 * office gets the minutes sooner, and more of them go out provisional, with
 * the steps to link the missing decisions. Calendar days: a working-day rule
 * needs a holiday calendar we do not have.
 */
export const MINUTES_THRESHOLD_DAYS = 5;

/**
 * How long a claim may stand before its sender counts as dead. A pending claim
 * that old is released for the next run. A sending claim that old may have
 * gone out, and the decisions page asks an operator to check it.
 */
export const STALE_PENDING_MINUTES = 30;

/**
 * How many times the automatic paths try one document of one meeting. A fault
 * that persists (a render that throws, an address the provider refuses) then
 * stops costing a failed row and a Discord alert every day; the decisions page
 * shows the send as failed, and an operator can still send it by hand.
 */
export const MAX_AUTOMATIC_ATTEMPTS = 3;

/** The moment before which a claim made at `createdAt` counts as stale. */
export function staleBefore(now: Date): Date {
    return new Date(now.getTime() - STALE_PENDING_MINUTES * 60 * 1000);
}

/** Every document, in the order the settings section and the admin list show them. */
export const DOCUMENT_KINDS = Object.values(DocumentKind) as DocumentKind[];

/** The fields of a setting that decide whether a meeting's document is sent, and where. */
export type DocumentSendRule = Omit<DocumentSendSettingRow, 'kind'>;

/**
 * Whether the switch-on of the setting covers a meeting: it is on, and the
 * meeting was held at or after the switch-on. Only the automatic sends ask
 * this (see evaluateReadiness): switching a document on never emails the
 * archive, but a person may still send any meeting's document by hand.
 */
export function settingAppliesTo(setting: DocumentSendRule | null | undefined, meetingDate: Date): boolean {
    if (!setting || !setting.enabled) return false;
    return meetingDate.getTime() >= setting.enabledAt.getTime();
}

/**
 * The recipients of a document of the body: the first address is To, the rest
 * are CC. Empty when the document is switched off. Whether a given meeting's
 * document goes out is the readiness rule's question, not this one's.
 */
export function recipientsFor(setting: DocumentSendRule | null | undefined): string[] {
    return setting?.enabled ? setting.recipientEmails : [];
}

/** The recipients as an email takes them: the first address is To, the rest are CC. */
export function splitRecipients(recipientEmails: string[]): { to: string | null; cc: string[] } {
    const [to = null, ...cc] = recipientEmails;
    return { to, cc };
}

/** What each document is called: in Greek for the emails, in English for the admin alerts. */
export const DOCUMENT_NAMES = {
    transcript: { el: 'Απομαγνητοφώνηση', en: 'Transcript' },
    minutes: { el: 'Πρακτικά', en: 'Minutes' },
} as const satisfies Record<DocumentKind, { el: string; en: string }>;
