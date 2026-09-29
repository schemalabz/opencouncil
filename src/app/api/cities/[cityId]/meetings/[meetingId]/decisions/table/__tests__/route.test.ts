/** @jest-environment node */
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeetingDirect: jest.fn() }));
jest.mock('@/lib/db/decisionsTable', () => ({ getDecisionTableCity: jest.fn(), getDecisionTableSubjects: jest.fn() }));
jest.mock('@/lib/derivation/persist', () => ({ explainMeeting: jest.fn() }));
jest.mock('@/lib/meetingName', () => ({ meetingLabel: jest.fn(() => 'Council meeting') }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/decisionsTable/getDecisionsTableData', () => ({ getDecisionsTableData: jest.fn() }));
jest.mock('@/components/meetings/docx/DecisionsTableDocx', () => ({ renderDecisionsTableDocx: jest.fn() }));

import { GET } from '../route';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getDecisionsTableData } from '@/lib/decisionsTable/getDecisionsTableData';
import { renderDecisionsTableDocx } from '@/components/meetings/docx/DecisionsTableDocx';
import { getCouncilMeetingDirect } from '@/lib/db/meetings';
import { getDecisionTableCity, getDecisionTableSubjects } from '@/lib/db/decisionsTable';
import { explainMeeting } from '@/lib/derivation/persist';
import { meetingLabel } from '@/lib/meetingName';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';

const mockAuthorize = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockData = getDecisionsTableData as jest.MockedFunction<typeof getDecisionsTableData>;
const mockRender = renderDecisionsTableDocx as jest.MockedFunction<typeof renderDecisionsTableDocx>;

const get = () => GET(
    new Request('http://localhost/api/cities/zografou/meetings/jul21_2026/decisions/table'),
    { params: Promise.resolve({ cityId: 'zografou', meetingId: 'jul21_2026' }) },
);

// Reset, not clear: the reader case leaves a rejection on the authorize mock.
beforeEach(() => jest.resetAllMocks());

describe('GET decisions/table', () => {
    it('returns the Πίνακας αποφάσεων as a .docx attachment to an admin', async () => {
        const tableData = { table: { rows: [], beforeAgenda: [] } } as unknown as Awaited<ReturnType<typeof getDecisionsTableData>>;
        mockData.mockResolvedValue(tableData);
        mockRender.mockResolvedValue(new Blob(['docx bytes']));

        const response = await get();

        // The meeting scope, so an admin of the meeting's body downloads as the layout lets them.
        expect(mockAuthorize).toHaveBeenCalledWith({ cityId: 'zografou', councilMeetingId: 'jul21_2026' });
        expect(mockData).toHaveBeenCalledWith('zografou', 'jul21_2026');
        expect(mockRender).toHaveBeenCalledWith(tableData);
        expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="decisions-table-zografou-jul21_2026.docx"');
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('docx bytes');
    });

    it('answers 403 to a signed-in reader before it loads anything', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        // What withUserAuthorizedToEdit throws for a user without the right (notAuthorizedError).
        mockAuthorize.mockRejectedValue(new ForbiddenError());
        const response = await get();
        expect(response.status).toBe(403);
        expect(mockData).not.toHaveBeenCalled();
    });

    it('answers 401 without a session', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        mockAuthorize.mockRejectedValue(new UnauthorizedError());
        const response = await get();
        expect(response.status).toBe(401);
        expect(mockData).not.toHaveBeenCalled();
    });

    it('answers 404 for a meeting that does not exist', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        mockData.mockRejectedValue(new NotFoundError('Meeting not found: zografou/nope'));
        const response = await get();
        expect(response.status).toBe(404);
    });
});

// Keep the export's actual data loader in this route suite: the regressions
// need the persisted vote rows and the read-only statement to meet before rendering.
describe('getDecisionsTableData source outcomes', () => {
    const actualData = jest.requireActual<typeof import('@/lib/decisionsTable/getDecisionsTableData')>(
        '@/lib/decisionsTable/getDecisionsTableData',
    ).getDecisionsTableData;

    it.each([
        { outcome: 'majority' as const, source: 'sheet' as const, votes: [{ voteType: 'AGAINST' as const }] },
        { outcome: 'unanimous' as const, source: 'transcript' as const, votes: [] },
    ])('exports a stated $outcome without treating incomplete rows as the vote', async ({ outcome, source, votes }) => {
        jest.mocked(meetingLabel).mockReturnValue('Council meeting');
        jest.mocked(getCouncilMeetingDirect).mockResolvedValue({
            id: 'm1', cityId: 'zografou', dateTime: new Date('2026-07-21T16:00:00Z'),
        } as Awaited<ReturnType<typeof getCouncilMeetingDirect>>);
        jest.mocked(getDecisionTableCity).mockResolvedValue({ name_municipality: 'Zografou', timezone: 'Europe/Athens' });
        jest.mocked(getDecisionTableSubjects).mockResolvedValue([{
            id: 's1', name: 'Agenda item', agendaItemTitle: null, agendaItemIndex: 1,
            agendaSectionIndex: null, nonAgendaReason: null, withdrawn: false,
            outcome: null, decision: null, votes,
        }]);
        jest.mocked(explainMeeting).mockResolvedValue({
            attendance: [], votes: [], rollCall: [], events: [], issues: [],
            outcomes: [{ subjectId: 's1', source, outcome, phrase: outcome }],
        });

        const data = await actualData('zografou', 'm1');

        expect(explainMeeting).toHaveBeenCalledWith('zografou', 'm1');
        expect(data.table.rows).toHaveLength(1);
        expect(data.table.rows[0]).toMatchObject({ result: outcome, voteCounts: null });
    });
});
