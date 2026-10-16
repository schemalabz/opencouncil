// Pure rules of the document send settings. The body form, the review dialog
// and the sender read them, so this module must stay free of server-only imports.
import { DocumentKind } from '@prisma/client';

/** Every document, in the order the settings section and the admin list show them. */
export const DOCUMENT_KINDS = Object.values(DocumentKind) as DocumentKind[];

/** The fields of a setting that decide whether a meeting's document is sent, and where. */
export interface DocumentSendRule {
    enabled: boolean;
    /** Null on a setting that predates the switch (see the schema): it covers every meeting. */
    enabledAt: Date | null;
    recipientEmails: string[];
}

/**
 * Whether the switch-on of the setting covers a meeting: it is on, and the
 * meeting was held at or after the switch-on. Only the automatic sends ask
 * this (see evaluateReadiness): switching a document on never emails the
 * archive, but a person may still send any meeting's document by hand.
 */
export function settingAppliesTo(setting: DocumentSendRule | null | undefined, meetingDate: Date): boolean {
    if (!setting || !setting.enabled) return false;
    return setting.enabledAt === null || meetingDate.getTime() >= setting.enabledAt.getTime();
}

/**
 * The recipients of a document of the body: the first address is To, the rest
 * are CC. Empty when the document is switched off. Whether a given meeting's
 * document goes out is the readiness rule's question, not this one's.
 */
export function recipientsFor(setting: DocumentSendRule | null | undefined): string[] {
    return setting?.enabled ? setting.recipientEmails : [];
}

/** What each document is called: in Greek for the emails, in English for the admin alerts. */
export const DOCUMENT_NAMES = {
    transcript: { el: 'Απομαγνητοφώνηση', en: 'Transcript' },
    minutes: { el: 'Πρακτικά', en: 'Minutes' },
} as const satisfies Record<DocumentKind, { el: string; en: string }>;
