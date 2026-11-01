// The transcript as a document the back office receives (#874): the DOCX the
// transcript page exports, and the email that carries it.
import "server-only";
import { render } from '@react-email/render';
import { DocumentSendTrigger } from '@prisma/client';
import { TranscriptEmail } from '@/lib/email/templates/TranscriptEmail';
import { generateMeetingDocxBuffer } from '@/lib/export/meetings-server';
import { generateMeetingFileName } from '@/lib/export/download';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { formatDate } from '@/lib/formatters/time';
import { sendDocument, type DocumentMeeting, type DocumentPayload, type SendDocumentResult } from './send';
import { DOCUMENT_NAMES } from './settings';

export async function transcriptPayload(meeting: DocumentMeeting): Promise<DocumentPayload> {
    const { cityId, id: meetingId } = meeting;
    const administrativeBodyName = meeting.administrativeBody?.name || meeting.city.name_municipality;
    const transcriptUrl = `${realmBaseUrl(meeting.city.realm)}/${cityId}/${meetingId}/transcript`;

    const [buffer, html] = await Promise.all([
        generateMeetingDocxBuffer(cityId, meetingId),
        render(TranscriptEmail({ administrativeBodyName, meetingDate: meeting.dateTime, transcriptUrl })),
    ]);

    return {
        buffer,
        filename: generateMeetingFileName(cityId, meetingId, 'docx'),
        // "Απομαγνητοφώνηση: {Administrative Body name}, {meeting date}"
        subject: `${DOCUMENT_NAMES.transcript.el}: ${administrativeBodyName}, ${formatDate(meeting.dateTime)}`,
        html,
    };
}

/**
 * Send the transcript of a reviewed meeting to the body's back office. The
 * review completion sends it automatically; an admin sends it by hand.
 */
export async function sendTranscript(
    cityId: string,
    meetingId: string,
    options: { trigger: DocumentSendTrigger; automatic: boolean },
): Promise<SendDocumentResult> {
    return sendDocument(cityId, meetingId, 'transcript', transcriptPayload, options);
}
