/** @jest-environment node */

/**
 * The one text field the decision matcher reads per subject (#616): the
 * verbatim agenda title when the subject has one, else the summary name.
 */

const mockCouncilMeetingFindUnique = jest.fn();
const mockUtteranceGroupBy = jest.fn().mockResolvedValue([]);
const mockDecisionFindMany = jest.fn().mockResolvedValue([]);
const mockDecisionCandidateFindMany = jest.fn().mockResolvedValue([]);
const mockStartTask = jest.fn().mockResolvedValue({ id: 'task-1' });
const mockGetPeopleForMeeting = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: { findUnique: (...args: unknown[]) => mockCouncilMeetingFindUnique(...args) },
        utterance: { groupBy: (...args: unknown[]) => mockUtteranceGroupBy(...args) },
        decision: { findMany: (...args: unknown[]) => mockDecisionFindMany(...args) },
        decisionCandidate: { findMany: (...args: unknown[]) => mockDecisionCandidateFindMany(...args) },
        taskStatus: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
        subject: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn() },
        $transaction: jest.fn(),
    },
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('@/lib/discord', () => ({
    sendTaskAdminAlert: jest.fn(),
    sendPollDecisionsBatchStartedAlert: jest.fn(),
    sendPollDecisionsBatchCompletedAlert: jest.fn(),
}));
jest.mock('@/lib/tasks/registry', () => ({ taskHandlers: {}, taskTerminalHooks: {} }));
jest.mock('@/lib/tasks/tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('@/lib/db/people', () => ({ getPeopleForMeeting: (...args: unknown[]) => mockGetPeopleForMeeting(...args) }));

import { pollDecisionsForMeeting } from '@/lib/tasks/pollDecisions';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

type SubjectRow = {
    id: string;
    name: string;
    agendaItemTitle: string | null;
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
};

function meetingWith(subjects: SubjectRow[]) {
    return {
        id: MEETING_ID,
        cityId: CITY_ID,
        dateTime: new Date('2026-03-04T18:00:00Z'),
        city: { diavgeiaUid: 'uid-1', timezone: 'Europe/Athens' },
        administrativeBody: { id: 'body-1', name: 'Δημοτικό Συμβούλιο', diavgeiaUnitIds: [] },
        subjects: subjects.map(s => ({ ...s, discussedIn: null, decision: null })),
    };
}

/** The `subjects` array of the request body handed to startTask. */
async function requestSubjects(subjects: SubjectRow[]) {
    mockCouncilMeetingFindUnique.mockResolvedValue(meetingWith(subjects));
    await pollDecisionsForMeeting(CITY_ID, MEETING_ID);
    expect(mockStartTask).toHaveBeenCalledTimes(1);
    const [taskType, body] = mockStartTask.mock.calls[0];
    expect(taskType).toBe('pollDecisions');
    return (body as { subjects: Array<Record<string, unknown>> }).subjects;
}

describe('pollDecisionsForMeeting — subject text sent to the matcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUtteranceGroupBy.mockResolvedValue([]);
        mockDecisionFindMany.mockResolvedValue([]);
        mockDecisionCandidateFindMany.mockResolvedValue([]);
        mockStartTask.mockResolvedValue({ id: 'task-1' });
        mockGetPeopleForMeeting.mockResolvedValue([]);
    });

    it('sends the verbatim agenda title when the subject has one', async () => {
        const sent = await requestSubjects([{
            id: 's1',
            name: 'Αποζημίωση ακινήτου Κόκκινο Μετόχι',
            agendaItemTitle: 'ΕΓΚΡΙΣΗ ΕΝΑΡΞΗΣ ΔΙΑΔΙΚΑΣΙΩΝ ΠΛΗΡΩΜΗΣ ΑΠΟΖΗΜΙΩΣΗΣ ΑΚΙΝΗΤΟΥ',
            agendaItemIndex: 1,
            nonAgendaReason: null,
        }]);

        expect(sent).toHaveLength(1);
        expect(sent[0].name).toBe('ΕΓΚΡΙΣΗ ΕΝΑΡΞΗΣ ΔΙΑΔΙΚΑΣΙΩΝ ΠΛΗΡΩΜΗΣ ΑΠΟΖΗΜΙΩΣΗΣ ΑΚΙΝΗΤΟΥ');
    });

    it('falls back to the summary name for a subject with no title', async () => {
        const sent = await requestSubjects([{
            id: 's1',
            name: 'Αποζημίωση ακινήτου Κόκκινο Μετόχι',
            agendaItemTitle: null,
            agendaItemIndex: 1,
            nonAgendaReason: null,
        }]);

        expect(sent[0].name).toBe('Αποζημίωση ακινήτου Κόκκινο Μετόχι');
    });

    it('chooses per subject, and never sends the description field', async () => {
        const sent = await requestSubjects([
            { id: 's1', name: 'Summary one', agendaItemTitle: 'ΤΙΤΛΟΣ ΕΝΑ', agendaItemIndex: 1, nonAgendaReason: null },
            { id: 's2', name: 'Summary two', agendaItemTitle: null, agendaItemIndex: 2, nonAgendaReason: null },
        ]);

        expect(sent.map(s => s.name)).toEqual(['ΤΙΤΛΟΣ ΕΝΑ', 'Summary two']);
        expect(sent.map(s => s.subjectId)).toEqual(['s1', 's2']);
        for (const s of sent) {
            expect(s).not.toHaveProperty('description');
        }
    });
});
