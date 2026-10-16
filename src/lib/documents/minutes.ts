// The minutes as a document the back office receives (#874): the DOCX the
// decisions page exports, and the complete or the provisional email.
import "server-only";
import { render } from '@react-email/render';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { MinutesEmail, MinutesIncompleteEmail, minutesEmailCopy } from '@/lib/email/templates/MinutesEmail';
import { documentBodyName, type DocumentMeeting } from '@/lib/db/types';
import { generateMinutesDocxBuffer } from '@/lib/export/meetings-server';
import { generateMinutesFileName } from '@/lib/export/download';
import { recordSection } from '@/lib/utils/subjects';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { getRealmContactPhone } from '@/lib/realm';
import type { DocumentPayload } from './send';
import { missingSubjectIdsOf, type SendableReadiness } from './readiness';

/**
 * The minutes DOCX and its email. A provisional readiness names the subjects
 * without a decision; the email lists them as the DOCX holds them, from the
 * same read, so the list and the attachment agree.
 */
export async function minutesPayload(meeting: DocumentMeeting, readiness: SendableReadiness): Promise<DocumentPayload> {
    const { cityId, id: meetingId, city } = meeting;
    const administrativeBodyName = documentBodyName(meeting);
    const meetingUrl = `${realmBaseUrl(city.realm)}/${cityId}/${meetingId}`;
    const decisionsUrl = `${meetingUrl}/decisions`;
    const contactPhone = getRealmContactPhone(city.realm);

    const data = await getMinutesData(cityId, meetingId);
    const missingIds = new Set(missingSubjectIdsOf(readiness));
    const missing = data.subjects
        .filter(subject => missingIds.has(subject.subjectId))
        .map(subject => ({ section: recordSection(subject), agendaItemIndex: subject.agendaItemIndex, title: subject.name }));
    const props = { administrativeBodyName, meetingDate: meeting.dateTime, timeZone: city.timezone, contactPhone };

    return {
        buffer: await generateMinutesDocxBuffer(data),
        filename: generateMinutesFileName(cityId, meetingId),
        subject: readiness.state === 'incomplete'
            ? minutesEmailCopy.subjectIncomplete(administrativeBodyName, meeting.dateTime, city.timezone)
            : minutesEmailCopy.subject(administrativeBodyName, meeting.dateTime, city.timezone),
        html: await render(readiness.state === 'incomplete'
            ? MinutesIncompleteEmail({ ...props, meetingUrl, decisionsUrl, missingSubjects: missing })
            : MinutesEmail(props)),
    };
}
