"use server";

import * as z from 'zod';
import { DocumentKind } from '@prisma/client';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { getReadinessFacts } from '@/lib/db/documentSends';
import { evaluateManualReadiness, readinessInputFor, type Readiness } from '@/lib/documents/readiness';
import { recipientsFor } from '@/lib/documents/settings';
import { sendDocument, type SendDocumentResult } from '@/lib/documents/send';
import { shownDocumentState, type DocumentState } from '@/lib/documents/status';

/** The arguments every action below takes from the browser, checked at run time. */
const documentTargetSchema = z.object({
    cityId: z.string().min(1),
    meetingId: z.string().min(1),
    kind: z.enum(DocumentKind),
});

/** What a send by hand would do now: where it goes and what it covers. */
export interface DocumentSendPreview {
    recipientEmails: string[];
    readiness: Readiness;
}

/**
 * Where a document of a meeting stands now, for a page that rendered the state
 * on the server and must follow it: a poll that lands may have sent the
 * minutes, and a send in flight ends without telling the page. Null when the
 * body does not send the document.
 */
export async function getDocumentState(cityId: string, meetingId: string, kind: DocumentKind): Promise<DocumentState | null> {
    const target = documentTargetSchema.parse({ cityId, meetingId, kind });
    await withUserAuthorizedToEdit({ cityId: target.cityId });
    const facts = await getReadinessFacts(target.cityId, target.meetingId);
    return facts && shownDocumentState(facts, target.kind, new Date());
}

/**
 * The recipients and the readiness of a document, for the confirm dialog of a
 * send by hand. A superadmin's action, as the send itself.
 */
export async function previewDocumentSend(cityId: string, meetingId: string, kind: DocumentKind): Promise<DocumentSendPreview | null> {
    const target = documentTargetSchema.parse({ cityId, meetingId, kind });
    await withUserAuthorizedToEdit({});
    const facts = await getReadinessFacts(target.cityId, target.meetingId);
    if (!facts) return null;
    const input = readinessInputFor(facts, target.kind, new Date());
    return { recipientEmails: recipientsFor(input.setting), readiness: evaluateManualReadiness(target.kind, input) };
}

/**
 * Send a document of a meeting now, at the request of a superadmin. A manual
 * send does not take the automatic slot of the meeting, so it may repeat: the
 * complete minutes after a provisional send, or a transcript sent twice. The
 * sender keeps every gate of the rule but the wait for decisions (see
 * evaluateManualReadiness), and records who asked.
 */
export async function sendDocumentNow(cityId: string, meetingId: string, kind: DocumentKind): Promise<SendDocumentResult> {
    const target = documentTargetSchema.parse({ cityId, meetingId, kind });
    await withUserAuthorizedToEdit({});
    const user = await getCurrentUser();
    return sendDocument(target.cityId, target.meetingId, target.kind, { by: 'person', userId: user?.id ?? null });
}
