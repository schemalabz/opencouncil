// The document send settings of a body and the record of each send (#874).
// Callers authorize: the body routes gate on editing rights, and the sender
// runs from the cron with no user session.
import "server-only";
import { DocumentKind } from '@prisma/client';
import prisma from './prisma';
import { documentSendSettingSelect, type DocumentSendSettingRow } from './types/documentSend';

/** The settings of a body, one per document that has a row. */
export async function getDocumentSendSettings(administrativeBodyId: string): Promise<DocumentSendSettingRow[]> {
    return prisma.documentSendSetting.findMany({
        where: { administrativeBodyId },
        select: documentSendSettingSelect,
    });
}

/** The setting of one document of a body, or null when the body has none. */
export async function getDocumentSendSetting(
    administrativeBodyId: string | null,
    document: DocumentKind,
): Promise<DocumentSendSettingRow | null> {
    if (!administrativeBodyId) return null;
    return prisma.documentSendSetting.findUnique({
        where: { administrativeBodyId_document: { administrativeBodyId, document } },
        select: documentSendSettingSelect,
    });
}
