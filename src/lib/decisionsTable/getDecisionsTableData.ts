import 'server-only';
import { getCouncilMeetingDirect } from '@/lib/db/meetings';
import { getDecisionTableCity, getDecisionTableSubjects } from '@/lib/db/decisionsTable';
import { NotFoundError } from '@/lib/api/errors';
import { meetingLabel } from '@/lib/meetingName';
import { buildDecisionTable, type DecisionTable } from './rows';

/** What the DOCX prints. Plain values only: the data crosses a route boundary as JSON. */
export interface DecisionsTableData {
    city: { name_municipality: string; timezone: string };
    meeting: { id: string; cityId: string; name: string; dateTime: string };
    administrativeBody: { name: string; type: string } | null;
    table: DecisionTable;
}

/**
 * The Πίνακας αποφάσεων of one meeting, through the same row builder as the
 * two on-screen tables. The caller authorizes: the route gates on editing
 * rights.
 */
export async function getDecisionsTableData(cityId: string, meetingId: string): Promise<DecisionsTableData> {
    const [meeting, city, subjects] = await Promise.all([
        getCouncilMeetingDirect(cityId, meetingId),
        getDecisionTableCity(cityId),
        getDecisionTableSubjects(cityId, meetingId),
    ]);
    if (!meeting || !city) throw new NotFoundError(`Meeting not found: ${cityId}/${meetingId}`);

    return {
        city: { name_municipality: city.name_municipality, timezone: city.timezone },
        meeting: {
            id: meeting.id,
            cityId: meeting.cityId,
            name: meetingLabel(meeting, 'el', city.timezone),
            dateTime: meeting.dateTime.toISOString(),
        },
        administrativeBody: meeting.administrativeBody
            ? { name: meeting.administrativeBody.name, type: meeting.administrativeBody.type }
            : null,
        table: buildDecisionTable(subjects),
    };
}
