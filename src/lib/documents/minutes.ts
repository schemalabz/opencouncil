// The minutes as a document the back office receives (#874): the DOCX the
// decisions page exports, and the complete or the provisional email.
import "server-only";
import { render } from '@react-email/render';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { renderMinutesDocx } from '@/components/meetings/docx/MinutesDocx';
import { MinutesEmail, MinutesIncompleteEmail, minutesEmailCopy } from '@/lib/email/templates/MinutesEmail';
import { getSubjectLabels } from '@/lib/db/documentSends';
import { agendaItemTitleOrName } from '@/lib/utils/subjects';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import type { DocumentMeeting, DocumentPayload } from './send';
import type { Readiness } from './readiness';

/** The file name the decisions page gives the export. */
export function minutesFileName(cityId: string, meetingId: string): string {
    const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `minutes-${safe(cityId)}-${safe(meetingId)}.docx`;
}

/**
 * The minutes DOCX and its email. An incomplete readiness names the subjects
 * without a decision, and the email lists them; every other readiness that
 * reaches a send is complete.
 */
export async function minutesPayload(meeting: DocumentMeeting, readiness: Readiness): Promise<DocumentPayload> {
    const { cityId, id: meetingId } = meeting;
    const administrativeBodyName = meeting.administrativeBody?.name || meeting.city.name_municipality;
    const decisionsUrl = `${realmBaseUrl(meeting.city.realm)}/${cityId}/${meetingId}/decisions`;
    const missingSubjectIds = readiness.state === 'incomplete' ? readiness.missingSubjectIds : [];

    const [data, missing] = await Promise.all([
        getMinutesData(cityId, meetingId),
        getSubjectLabels(missingSubjectIds),
    ]);
    const blob = await renderMinutesDocx(data);
    const buffer = Buffer.from(await blob.arrayBuffer());

    const email = missing.length > 0
        ? MinutesIncompleteEmail({
            administrativeBodyName,
            meetingDate: meeting.dateTime,
            decisionsUrl,
            missingSubjects: missing.map(subject => ({ agendaItemIndex: subject.agendaItemIndex, title: agendaItemTitleOrName(subject) })),
        })
        : MinutesEmail({ administrativeBodyName, meetingDate: meeting.dateTime, decisionsUrl });

    return {
        buffer,
        filename: minutesFileName(cityId, meetingId),
        subject: missing.length > 0
            ? minutesEmailCopy.subjectIncomplete(administrativeBodyName, meeting.dateTime)
            : minutesEmailCopy.subject(administrativeBodyName, meeting.dateTime),
        html: await render(email),
    };
}
