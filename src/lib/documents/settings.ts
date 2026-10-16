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
 * Whether the setting covers a meeting: it is on, and the meeting was held at
 * or after the switch-on. Switching a document on never emails the archive.
 */
export function settingAppliesTo(setting: DocumentSendRule | null | undefined, meetingDate: Date): boolean {
    if (!setting || !setting.enabled) return false;
    return setting.enabledAt === null || meetingDate.getTime() >= setting.enabledAt.getTime();
}

/**
 * The recipients of a meeting's document: the first address is To, the rest
 * are CC. Empty when the setting does not cover the meeting.
 */
export function recipientsFor(setting: DocumentSendRule | null | undefined, meetingDate: Date): string[] {
    return settingAppliesTo(setting, meetingDate) ? setting!.recipientEmails : [];
}
