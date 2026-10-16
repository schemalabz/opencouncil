// The one path that emails a document to a body's back office (#874). Callers
// authorize: the review completion and the admin buttons run for a user, the
// cron and the poll callback run with no session.
import "server-only";
import { DocumentKind, DocumentSendTrigger } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import {
    claimDocumentSend,
    getDocumentSendSetting,
    getMeetingForDocumentSend,
    markDocumentSending,
    settleDocumentSend,
} from '@/lib/db/documentSends';
import type { DocumentMeeting } from '@/lib/db/types';
import { sendEmail } from '@/lib/email/resend';
import { sendDocumentSentAdminAlert, sendDocumentSendFailedAdminAlert } from '@/lib/discord';
import { meetingLabelInCity } from '@/lib/meetingName';
import { recipientsFor } from './settings';

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type { DocumentMeeting };

/** The rendered document and the email that carries it. */
export interface DocumentPayload {
    filename: string;
    buffer: Buffer;
    subject: string;
    html: string;
}

export type DocumentPayloadBuilder = (meeting: DocumentMeeting) => Promise<DocumentPayload>;

/** What the document covers. The minutes may go out before every decision is in. */
export interface DocumentCompleteness {
    complete: boolean;
    missingSubjectIds: string[];
}

export interface SendDocumentOptions {
    trigger: DocumentSendTrigger;
    /**
     * An automatic send takes the one slot per meeting and document that the
     * partial unique index allows; a second automatic sender stops there. A
     * send a person asked for by hand is not automatic and may repeat.
     */
    automatic: boolean;
    completeness?: DocumentCompleteness;
}

/**
 * The outcome of a send. `skipped` means that nothing went out and nothing is
 * wrong: the setting does not cover the meeting, or another sender holds the
 * slot. Never throws: the callers report the outcome and carry on.
 */
export interface SendDocumentResult {
    success: boolean;
    skipped?: boolean;
    recipientEmails?: string[];
    error?: string;
}

const COMPLETE: DocumentCompleteness = { complete: true, missingSubjectIds: [] };

const SETTLE_RETRY_MS = 500;

/**
 * Mark a claim sent after the email went out. Once the email is out, a failure
 * here must not read as a failed send: the email cannot be recalled. The claim
 * then stays `sending`, which nothing sends again on its own, and the admin
 * list shows it as unconfirmed. So it tries twice and returns what went wrong,
 * if anything.
 */
async function recordSent(claimId: string): Promise<string | null> {
    for (let attempt = 1; ; attempt++) {
        try {
            const recorded = await settleDocumentSend(claimId, { status: 'sent', sentAt: new Date() });
            return recorded ? null : 'the claim was released as stale before the send was recorded';
        } catch (error) {
            if (attempt === 2) return error instanceof Error ? error.message : 'unknown error';
            await new Promise(resolve => setTimeout(resolve, SETTLE_RETRY_MS));
        }
    }
}

/**
 * Send one document of one meeting. The pending row is claimed before the
 * render, so an automatic send never follows another send of the document
 * that is pending or sent; it skips instead. The row then records
 * the outcome, and the admin alerts say what happened.
 */
export async function sendDocument(
    cityId: string,
    meetingId: string,
    document: DocumentKind,
    buildPayload: DocumentPayloadBuilder,
    { trigger, automatic, completeness = COMPLETE }: SendDocumentOptions,
): Promise<SendDocumentResult> {
    const tag = `[sendDocument:${document}]`;
    try {
        const meeting = await getMeetingForDocumentSend(cityId, meetingId);
        if (!meeting) {
            const error = `Meeting not found: ${cityId}/${meetingId}`;
            console.error(`${tag} ${error}`);
            await sendDocumentSendFailedAdminAlert({ document, cityId, meetingId, error });
            return { success: false, error };
        }

        const setting = await getDocumentSendSetting(meeting.administrativeBodyId, document);
        const recipientEmails = recipientsFor(setting);
        if (recipientEmails.length === 0) {
            console.log(`${tag} The document is switched off for the body, skipping: ${cityId}/${meetingId}`);
            return { success: true, skipped: true };
        }

        const claim = await claimDocumentSend({
            cityId, councilMeetingId: meetingId, document, trigger, automatic, recipientEmails,
            complete: completeness.complete, missingSubjectIds: completeness.missingSubjectIds,
        });
        if (claim === 'taken') {
            console.log(`${tag} Another send of the document is pending or sent, skipping: ${cityId}/${meetingId}`);
            return { success: true, skipped: true };
        }

        const fail = async (error: string) => {
            console.error(`${tag} ${error}`);
            await settleDocumentSend(claim.id, { status: 'failed', failureReason: error });
            await sendDocumentSendFailedAdminAlert({ document, cityId, meetingId, error });
            return { success: false, error } satisfies SendDocumentResult;
        };

        let payload: DocumentPayload;
        try {
            payload = await buildPayload(meeting);
        } catch (error) {
            return fail(error instanceof Error ? error.message : 'Unknown error rendering the document');
        }

        // From here the email may go out, so the claim leaves the stale release
        if (!(await markDocumentSending(claim.id))) {
            return fail('The claim was released as stale before the email went out');
        }

        // The first address is To, the rest CC
        const [to, ...cc] = recipientEmails;
        const result = await sendEmail({
            from: 'operations',
            to,
            cc: cc.length > 0 ? cc : undefined,
            subject: payload.subject,
            html: payload.html,
            attachments: [{ filename: payload.filename, content: payload.buffer, contentType: DOCX_CONTENT_TYPE }],
        });
        if (!result.success) {
            if (result.outcome === 'rejected') return fail(result.message || 'Failed to send email');
            // The email may have gone out: the claim stays `sending`, which
            // nothing sends again on its own, and the admin list shows it as unconfirmed.
            const error = `The email provider gave no clear answer (${result.message}). The row stays unconfirmed, and nothing sends it again on its own.`;
            console.error(`${tag} ${error}`);
            await sendDocumentSendFailedAdminAlert({ document, cityId, meetingId, error });
            return { success: false, error };
        }

        const notRecorded = await recordSent(claim.id);
        if (notRecorded) {
            console.error(`${tag} Email sent for ${cityId}/${meetingId}, but the send was not recorded: ${notRecorded}`);
            await sendDocumentSendFailedAdminAlert({
                document, cityId, meetingId,
                error: `The email went out, but the send was not recorded (${notRecorded}). The row stays unconfirmed, and nothing sends it again on its own.`,
            });
        }

        // The admin list reads the sends of the meeting
        try {
            revalidateTag(`city:${cityId}:meetings`, 'max');
        } catch (error) {
            console.error(`${tag} Failed to revalidate cache for city ${cityId}:`, error);
        }

        const administrativeBodyName = meeting.administrativeBody?.name || meeting.city.name_municipality;
        await sendDocumentSentAdminAlert({
            document,
            cityId,
            cityName: meeting.city.name_en,
            meetingId,
            meetingName: meetingLabelInCity(meeting, 'el'),
            recipientEmails,
            administrativeBodyName,
            trigger,
            missingSubjects: completeness.complete ? 0 : completeness.missingSubjectIds.length,
        });

        console.log(`${tag} Sent to ${recipientEmails.join(', ')} for ${cityId}/${meetingId} (${trigger})`);
        return { success: true, recipientEmails };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`${tag} Unexpected error: ${errorMessage}`, error);
        try {
            await sendDocumentSendFailedAdminAlert({ document, cityId, meetingId, error: errorMessage });
        } catch {
            // A failed alert must not hide the result
        }
        return { success: false, error: errorMessage };
    }
}
