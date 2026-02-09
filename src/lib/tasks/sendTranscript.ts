"use server";

import { render } from '@react-email/render';
import prisma from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/resend';
import { TranscriptEmail } from '@/lib/email/templates/TranscriptEmail';
import { generateMeetingDocxBuffer } from '@/lib/export/meetings-server';
import { sendTranscriptSentAdminAlert, sendTranscriptSendFailedAdminAlert } from '@/lib/discord';
import { env } from '@/env.mjs';
import { formatDate } from '@/lib/formatters/time';

/**
 * Generate the filename for a meeting transcript DOCX.
 */
function generateTranscriptFileName(cityId: string, meetingId: string): string {
    return `${cityId}_council_meeting_${meetingId}.docx`;
}

export interface SendTranscriptResult {
    success: boolean;
    skipped?: boolean;
    recipientEmails?: string[];
    error?: string;
}

/**
 * Send the transcript of a completed human review to the municipality.
 * This is called automatically after human review is marked complete.
 *
 * @returns Result object indicating success/failure/skip status (never throws)
 */
export async function sendTranscriptToMunicipality(
    cityId: string,
    meetingId: string
): Promise<SendTranscriptResult> {
    try {
        // Fetch meeting with administrative body to get contact email
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id: meetingId } },
            include: {
                administrativeBody: true,
                city: true,
            },
        });

        if (!meeting) {
            const error = `Meeting not found: ${cityId}/${meetingId}`;
            console.error(`[sendTranscript] ${error}`);
            await sendTranscriptSendFailedAdminAlert({ cityId, meetingId, error });
            return { success: false, error };
        }

        // Check if contact emails are configured
        const contactEmails = meeting.administrativeBody?.contactEmails || [];
        if (contactEmails.length === 0) {
            console.log(`[sendTranscript] No contact emails configured for administrative body, skipping: ${cityId}/${meetingId}`);
            return { success: true, skipped: true };
        }

        // Generate DOCX buffer
        let docxBuffer: Buffer;
        try {
            docxBuffer = await generateMeetingDocxBuffer(cityId, meetingId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error generating DOCX';
            console.error(`[sendTranscript] Failed to generate DOCX: ${errorMessage}`);
            await sendTranscriptSendFailedAdminAlert({ cityId, meetingId, error: errorMessage });
            return { success: false, error: errorMessage };
        }

        // Generate filename
        const filename = generateTranscriptFileName(cityId, meetingId);

        // Build transcript URL (links to the /transcript page)
        const transcriptUrl = `${env.NEXT_PUBLIC_BASE_URL}/${cityId}/${meetingId}/transcript`;

        // Render email template
        const administrativeBodyName = meeting.administrativeBody?.name || meeting.city.name_municipality;
        const meetingDateFormatted = formatDate(meeting.dateTime);

        const emailHtml = await render(
            TranscriptEmail({
                administrativeBodyName,
                meetingDate: meeting.dateTime,
                transcriptUrl,
            })
        );

        // Build email subject: "Απομαγνητοφώνηση: {Administrative Body name}, {meeting date}"
        const subject = `Απομαγνητοφώνηση: ${administrativeBodyName}, ${meetingDateFormatted}`;

        // Send email with attachment (first email as 'to', rest as 'cc')
        const [primaryEmail, ...ccEmails] = contactEmails;
        const result = await sendEmail({
            from: 'OpenCouncil <operations@opencouncil.gr>',
            to: primaryEmail,
            cc: ccEmails.length > 0 ? ccEmails : undefined,
            subject,
            html: emailHtml,
            attachments: [
                {
                    filename,
                    content: docxBuffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                },
            ],
        });

        if (!result.success) {
            const error = result.message || 'Failed to send email';
            console.error(`[sendTranscript] ${error}`);
            await sendTranscriptSendFailedAdminAlert({ cityId, meetingId, error });
            return { success: false, error };
        }

        // Send success Discord alert
        await sendTranscriptSentAdminAlert({
            cityId,
            cityName: meeting.city.name_en,
            meetingId,
            meetingName: meeting.name,
            recipientEmails: contactEmails,
            administrativeBodyName,
        });

        console.log(`[sendTranscript] Transcript sent successfully to ${contactEmails.join(', ')} for ${cityId}/${meetingId}`);
        return { success: true, recipientEmails: contactEmails };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[sendTranscript] Unexpected error: ${errorMessage}`, error);

        try {
            await sendTranscriptSendFailedAdminAlert({ cityId, meetingId, error: errorMessage });
        } catch {
            // Ignore Discord alert failures
        }

        return { success: false, error: errorMessage };
    }
}
