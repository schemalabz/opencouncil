"use server";

import { withUserAuthorizedToEdit } from '@/lib/auth';
import { sendTranscript } from '@/lib/documents/transcript';
import type { SendDocumentResult } from '@/lib/documents/send';

/**
 * Send the transcript of a meeting now, at the request of an admin. A manual
 * send may repeat: it does not take the automatic slot of the meeting.
 */
export async function sendTranscriptNow(cityId: string, meetingId: string): Promise<SendDocumentResult> {
    // The city's, not the body admin's: sending the transcript is part of
    // the human review, which a body admin does not complete (#828).
    await withUserAuthorizedToEdit({ cityId });
    return sendTranscript(cityId, meetingId, { trigger: 'manual', automatic: false });
}
