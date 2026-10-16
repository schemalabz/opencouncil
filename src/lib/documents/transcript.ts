// The transcript as a document the back office receives (#874): the DOCX the
// transcript page exports, and the email that carries it.
import "server-only";
import { render } from '@react-email/render';
import { TranscriptEmail } from '@/lib/email/templates/TranscriptEmail';
import { documentEmailSubject } from '@/lib/email/components/BackOfficeEmail';
import { generateMeetingDocxBuffer } from '@/lib/export/meetings-server';
import { generateMeetingFileName } from '@/lib/export/download';
import { documentBodyName, type DocumentMeeting } from '@/lib/db/types';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { getRealmContactPhone } from '@/lib/realm';
import type { DocumentPayload } from './send';
import { DOCUMENT_NAMES } from './settings';

export async function transcriptPayload(meeting: DocumentMeeting): Promise<DocumentPayload> {
    const { cityId, id: meetingId, city } = meeting;
    const administrativeBodyName = documentBodyName(meeting);
    const transcriptUrl = `${realmBaseUrl(city.realm)}/${cityId}/${meetingId}/transcript`;

    const [buffer, html] = await Promise.all([
        generateMeetingDocxBuffer(cityId, meetingId),
        render(TranscriptEmail({
            administrativeBodyName,
            meetingDate: meeting.dateTime,
            timeZone: city.timezone,
            contactPhone: getRealmContactPhone(city.realm),
            transcriptUrl,
        })),
    ]);

    return {
        buffer,
        filename: generateMeetingFileName(cityId, meetingId, 'docx'),
        subject: documentEmailSubject(DOCUMENT_NAMES.transcript.el, administrativeBodyName, meeting.dateTime, city.timezone),
        html,
    };
}
