"use server";

import type { DocumentKind } from '@prisma/client';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getReadinessFacts } from '@/lib/db/documentSends';
import { documents } from '@/lib/documents/registry';
import { evaluateReadiness, type Readiness } from '@/lib/documents/readiness';
import { readinessInputFor } from '@/lib/documents/automatic';
import { recipientsFor } from '@/lib/documents/settings';
import { sendDocument, type SendDocumentResult } from '@/lib/documents/send';

/** What a send by hand would do now: where it goes and what it covers. */
export interface DocumentSendPreview {
    recipientEmails: string[];
    readiness: Readiness;
}

/**
 * A send by hand sends what the meeting holds now: complete when every eligible
 * subject has its decision, provisional otherwise. It may send a meeting held
 * before the switch-on, and a transcript before its review, as the transcript
 * button always could (see evaluateReadiness). It never sends minutes of an
 * unreviewed meeting, or of a meeting with no agenda: those minutes would be
 * empty, and the email would call them complete.
 */
async function manualReadiness(cityId: string, meetingId: string, document: DocumentKind): Promise<DocumentSendPreview | null> {
    const facts = await getReadinessFacts(cityId, meetingId);
    if (!facts) return null;
    const input = readinessInputFor(facts, document, new Date());
    const readiness = evaluateReadiness(document, input, { byHand: true });
    const recipientEmails = recipientsFor(input.setting);
    // Before the threshold the rule waits for the decisions; a person may send now, with what is there
    if (readiness.state === 'wait' && readiness.reason === 'decisions') {
        const missingSubjectIds = input.subjects.filter(subject => !subject.decided).map(subject => subject.id);
        return { recipientEmails, readiness: { state: 'incomplete', missingSubjectIds } };
    }
    return { recipientEmails, readiness };
}

/** Why a send by hand cannot go out yet, in the words the dialog and the error use. */
const WAIT_REFUSAL = {
    review: 'The review of the meeting is not complete',
    agenda: 'The meeting has no agenda subjects yet, so its minutes would be empty',
    decisions: 'The minutes wait for their decisions',
} as const;

/** The recipients and the readiness of a document, for the confirm dialog of a send by hand. */
export async function previewDocumentSend(cityId: string, meetingId: string, document: DocumentKind): Promise<DocumentSendPreview | null> {
    await withUserAuthorizedToEdit({ cityId });
    return manualReadiness(cityId, meetingId, document);
}

/**
 * Send a document of a meeting now, at the request of an admin. A manual send
 * does not take the automatic slot of the meeting, so it may repeat: the
 * complete minutes after a provisional send, or a transcript sent twice.
 */
export async function sendDocumentNow(cityId: string, meetingId: string, document: DocumentKind): Promise<SendDocumentResult> {
    // The city's, not the body admin's: a send by hand follows the human
    // review, which a body admin does not complete (#828).
    await withUserAuthorizedToEdit({ cityId });
    const preview = await manualReadiness(cityId, meetingId, document);
    if (!preview) return { success: false, error: `Meeting not found: ${cityId}/${meetingId}` };
    const { readiness } = preview;
    if (readiness.state === 'none') return { success: false, error: `The ${document} is not sent for this meeting (${readiness.reason})` };
    if (readiness.state === 'wait') return { success: false, error: WAIT_REFUSAL[readiness.reason] };
    return sendDocument(cityId, meetingId, document, (meeting) => documents[document].payload(meeting, readiness), {
        trigger: 'manual',
        automatic: false,
        completeness: readiness.state === 'complete'
            ? { complete: true, missingSubjectIds: [] }
            : { complete: false, missingSubjectIds: readiness.missingSubjectIds },
    });
}
