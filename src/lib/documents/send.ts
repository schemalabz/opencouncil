// The one path that emails a document to a body's back office (#874). Callers
// authorize: the review completion and the admin buttons run for a user, the
// cron and the poll callback run with no session.
import "server-only";
import { DocumentKind, DocumentSendTrigger } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import {
    claimDocumentSend,
    getMeetingForDocumentSend,
    getReadinessFacts,
    isMeetingBeingWritten,
    markDocumentSending,
    settleDocumentSend,
} from '@/lib/db/documentSends';
import { documentBodyName } from '@/lib/db/types';
import { sendEmail } from '@/lib/email/resend';
import { sendDocumentSentAdminAlert, sendDocumentSendFailedAdminAlert } from '@/lib/discord';
import { meetingLabelInCity } from '@/lib/meetingName';
import { retryWithBackoff } from '@/lib/utils/retry';
import { errorMessage } from '@/lib/utils/errors';
import { UPLOAD_FORMATS } from '@/types/upload';
import {
    evaluateManualReadiness,
    evaluateReadiness,
    isSendable,
    missingSubjectIdsOf,
    readinessInputFor,
    type NotSentReason,
    type Readiness,
    type SendableReadiness,
    type WaitReason,
} from './readiness';
import { recipientsFor, splitRecipients } from './settings';
import { skipsAutomaticSend } from './status';
import { documents } from './registry';

/** The rendered document and the email that carries it. */
export interface DocumentPayload {
    filename: string;
    buffer: Buffer;
    subject: string;
    html: string;
}

/**
 * Who asks for the send. `automatic`: the cron and the hooks of the poll, the
 * summarize and the review, for a document that goes out on its own. `review`:
 * the transcript at the review completion, when the reviewer leaves its box
 * ticked. Both take the one automatic slot of the meeting and document, so a
 * second automatic sender stops there. `person`: a send by hand, which may
 * repeat and records who asked for it.
 */
export type SendRequest =
    | { by: 'automatic' }
    | { by: 'review' }
    | { by: 'person'; userId: string | null };

/**
 * The outcome of a send. `skipped` means that nothing went out and nothing is
 * wrong: the document is not ready, or another sender holds the slot. A send
 * by hand that the rule refuses carries the reason, for the dialog to say.
 * Never throws: the callers report the outcome and carry on.
 */
export interface SendDocumentResult {
    success: boolean;
    skipped?: boolean;
    refusal?: NotSentReason | WaitReason;
    /** What the rule said, read right before the claim. */
    readiness?: Readiness;
    recipientEmails?: string[];
    error?: string;
}

function triggerOf(request: SendRequest, readiness: SendableReadiness): DocumentSendTrigger {
    if (request.by === 'person') return 'manual';
    if (request.by === 'review') return 'review';
    return readiness.state === 'complete' ? 'complete' : 'threshold';
}

/**
 * Mark a claim sent after the email went out. Once the email is out, a failure
 * here must not read as a failed send: the email cannot be recalled. The claim
 * then stays `sending`, which nothing sends again on its own, and the decisions
 * page shows it as unconfirmed. So it tries twice and returns what went wrong,
 * if anything.
 */
async function recordSent(claimId: string): Promise<string | null> {
    try {
        const recorded = await retryWithBackoff(() => settleDocumentSend(claimId, { status: 'sent', sentAt: new Date() }), { maxAttempts: 2, initialDelayMs: 500 });
        return recorded ? null : 'the claim was released as stale before the send was recorded';
    } catch (error) {
        return errorMessage(error);
    }
}

/**
 * Send one document of one meeting. It reads the meeting and evaluates the
 * rule itself, right before the claim, so the email, the record and the
 * attached DOCX describe the same moment. The pending row is claimed before
 * the render, so an automatic send never follows another send of the document
 * that is pending or sent; it skips instead. The row then records the
 * outcome, and the admin alerts say what happened.
 */
export async function sendDocument(
    cityId: string,
    meetingId: string,
    kind: DocumentKind,
    request: SendRequest,
): Promise<SendDocumentResult> {
    const tag = `[sendDocument:${kind}]`;
    const now = new Date();
    try {
        const [facts, meeting] = await Promise.all([getReadinessFacts(cityId, meetingId), getMeetingForDocumentSend(cityId, meetingId)]);
        if (!facts || !meeting) {
            const error = `Meeting not found: ${cityId}/${meetingId}`;
            console.error(`${tag} ${error}`);
            await sendDocumentSendFailedAdminAlert({ document: kind, cityId, meetingId, error });
            return { success: false, error };
        }

        const input = readinessInputFor(facts, kind, now);
        const readiness = request.by === 'person' ? evaluateManualReadiness(kind, input) : evaluateReadiness(kind, input);
        if (!isSendable(readiness)) {
            return request.by === 'person'
                ? { success: false, refusal: readiness.reason, readiness, error: `The ${kind} cannot go out now (${readiness.reason})` }
                : { success: true, skipped: true, readiness };
        }
        if (request.by === 'automatic') {
            if (skipsAutomaticSend(facts, kind)) return { success: true, skipped: true, readiness };
            // The hook of the task that writes sends once its results are in
            if (await isMeetingBeingWritten(cityId, meetingId, now)) return { success: true, skipped: true, readiness };
        }

        const recipientEmails = recipientsFor(input.setting);
        const { to, cc } = splitRecipients(recipientEmails);
        if (!to) {
            console.log(`${tag} The document has no recipient, skipping: ${cityId}/${meetingId}`);
            // A person asked for a send that cannot happen: say so, as for a refusal
            return request.by === 'person'
                ? { success: false, refusal: 'disabled', readiness, error: `The ${kind} has no recipient` }
                : { success: true, skipped: true, readiness };
        }

        const trigger = triggerOf(request, readiness);
        const missingSubjectIds = missingSubjectIdsOf(readiness);
        const claim = await claimDocumentSend({
            cityId, councilMeetingId: meetingId, kind, trigger, recipientEmails, missingSubjectIds,
            createdById: request.by === 'person' ? request.userId : null,
        });
        if (claim === 'taken') {
            console.log(`${tag} Another send of the document is pending or sent, skipping: ${cityId}/${meetingId}`);
            return { success: true, skipped: true, readiness };
        }

        const fail = async (error: string) => {
            console.error(`${tag} ${error}`);
            await settleDocumentSend(claim.id, { status: 'failed', failureReason: error });
            await sendDocumentSendFailedAdminAlert({ document: kind, cityId, meetingId, error });
            return { success: false, readiness, error } satisfies SendDocumentResult;
        };

        let payload: DocumentPayload;
        try {
            payload = await documents[kind].payload(meeting, readiness);
        } catch (error) {
            return fail(errorMessage(error));
        }

        // From here the email may go out, so the claim leaves the stale release
        if (!(await markDocumentSending(claim.id))) {
            return fail('The claim was released as stale before the email went out');
        }

        const result = await sendEmail({
            from: 'operations',
            to,
            cc: cc.length > 0 ? cc : undefined,
            subject: payload.subject,
            html: payload.html,
            attachments: [{ filename: payload.filename, content: payload.buffer, contentType: UPLOAD_FORMATS.docx.contentType }],
        });
        if (!result.success) {
            if (result.outcome === 'rejected') return fail(result.message || 'Failed to send email');
            // The email may have gone out: the claim stays `sending`, which
            // nothing sends again on its own, and the decisions page shows it as unconfirmed.
            const error = `The email provider gave no clear answer (${result.message}). The row stays unconfirmed, and nothing sends it again on its own.`;
            console.error(`${tag} ${error}`);
            await sendDocumentSendFailedAdminAlert({ document: kind, cityId, meetingId, error });
            return { success: false, readiness, error };
        }

        const notRecorded = await recordSent(claim.id);
        if (notRecorded) {
            console.error(`${tag} Email sent for ${cityId}/${meetingId}, but the send was not recorded: ${notRecorded}`);
            await sendDocumentSendFailedAdminAlert({
                document: kind, cityId, meetingId,
                error: `The email went out, but the send was not recorded (${notRecorded}). The row stays unconfirmed, and nothing sends it again on its own.`,
            });
        }

        // The meeting pages read the sends of the meeting
        try {
            revalidateTag(`city:${cityId}:meetings`, 'max');
        } catch (error) {
            console.error(`${tag} Failed to revalidate cache for city ${cityId}:`, error);
        }

        await sendDocumentSentAdminAlert({
            document: kind,
            cityId,
            cityName: meeting.city.name_en,
            meetingId,
            meetingName: meetingLabelInCity(meeting, 'el'),
            recipientEmails,
            administrativeBodyName: documentBodyName(meeting),
            trigger,
            missingSubjects: missingSubjectIds.length,
        });

        console.log(`${tag} Sent to ${recipientEmails.join(', ')} for ${cityId}/${meetingId} (${trigger})`);
        return { success: true, readiness, recipientEmails };
    } catch (error) {
        const message = errorMessage(error);
        console.error(`${tag} Unexpected error: ${message}`, error);
        try {
            await sendDocumentSendFailedAdminAlert({ document: kind, cityId, meetingId, error: message });
        } catch {
            // A failed alert must not hide the result
        }
        return { success: false, error: message };
    }
}
