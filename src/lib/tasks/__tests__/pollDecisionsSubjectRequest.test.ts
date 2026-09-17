/** @jest-environment node */

/**
 * The per-subject entry point behind the "search for a decision" button.
 * It rejected every out-of-agenda subject until this test existed: the button
 * appeared on 460 production pages and the action refused all of them, and the
 * client swallowed the error, so only a Discord alert reported it. The
 * predicate has its own unit tests — this one covers the lookup, the select,
 * and the dispatch that carry the decision to the poller.
 */

const mockSubjectFindUnique = jest.fn();
const mockTaskStatusFindFirst = jest.fn().mockResolvedValue(null);
const mockCouncilMeetingFindUnique = jest.fn();
const mockStartTask = jest.fn().mockResolvedValue({ id: 'task-1' });

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        subject: {
            findUnique: (...args: unknown[]) => mockSubjectFindUnique(...args),
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        taskStatus: {
            findFirst: (...args: unknown[]) => mockTaskStatusFindFirst(...args),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        councilMeeting: { findUnique: (...args: unknown[]) => mockCouncilMeetingFindUnique(...args) },
        utterance: { groupBy: jest.fn().mockResolvedValue([]) },
        decision: { findMany: jest.fn().mockResolvedValue([]) },
        decisionCandidate: { findMany: jest.fn().mockResolvedValue([]) },
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
jest.mock('@/lib/db/people', () => ({ getPeopleForMeeting: jest.fn().mockResolvedValue([]) }));

import { requestPollDecisionForSubject } from '@/lib/tasks/pollDecisions';

const CITY_ID = 'vrilissia';
const MEETING_ID = 'meeting-1';

/** The subject the production alert came from: urgent, approved, no index. */
const OUT_OF_AGENDA_SUBJECT = {
    id: 'subject-1',
    name: 'Εδαφόπλακα ΟΤ 61 - πρακτικό επιτροπής',
    agendaItemTitle: null,
    agendaItemIndex: null,
    nonAgendaReason: 'outOfAgenda',
    withdrawn: false,
    cityId: CITY_ID,
    councilMeetingId: MEETING_ID,
};

function meetingWith(subjects: Array<Record<string, unknown>>) {
    return {
        id: MEETING_ID,
        cityId: CITY_ID,
        dateTime: new Date('2026-09-16T18:00:00Z'),
        city: { diavgeiaUid: 'uid-1', timezone: 'Europe/Athens' },
        administrativeBody: { id: 'body-1', name: 'Δημοτική Επιτροπή', diavgeiaUnitIds: [] },
        subjects: subjects.map(s => ({ ...s, discussedIn: null, decision: null })),
    };
}

describe('requestPollDecisionForSubject', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTaskStatusFindFirst.mockResolvedValue(null);
        mockStartTask.mockResolvedValue({ id: 'task-1' });
        mockCouncilMeetingFindUnique.mockResolvedValue(meetingWith([OUT_OF_AGENDA_SUBJECT]));
    });

    it('polls for an out-of-agenda subject, and sends it to the matcher', async () => {
        mockSubjectFindUnique.mockResolvedValue(OUT_OF_AGENDA_SUBJECT);

        const result = await requestPollDecisionForSubject('subject-1');

        expect(result).toEqual({
            status: 'requested',
            taskId: 'task-1',
            cityId: CITY_ID,
            meetingId: MEETING_ID,
        });

        expect(mockStartTask).toHaveBeenCalledTimes(1);
        const [taskType, body] = mockStartTask.mock.calls[0];
        expect(taskType).toBe('pollDecisions');
        const sent = (body as { subjects: Array<Record<string, unknown>> }).subjects;
        expect(sent.map(s => s.subjectId)).toEqual(['subject-1']);
    });

    it('reads the fields the eligibility rule needs', async () => {
        mockSubjectFindUnique.mockResolvedValue(OUT_OF_AGENDA_SUBJECT);

        await requestPollDecisionForSubject('subject-1');

        const { select } = mockSubjectFindUnique.mock.calls[0][0];
        expect(select).toMatchObject({ agendaItemIndex: true, nonAgendaReason: true, withdrawn: true });
    });

    it('refuses a withdrawn out-of-agenda subject, which the body rejected as urgent', async () => {
        mockSubjectFindUnique.mockResolvedValue({ ...OUT_OF_AGENDA_SUBJECT, withdrawn: true });

        await expect(requestPollDecisionForSubject('subject-1')).rejects.toThrow('not eligible for decisions');
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it('does not start a second task while one is already running for the meeting', async () => {
        mockSubjectFindUnique.mockResolvedValue(OUT_OF_AGENDA_SUBJECT);
        mockTaskStatusFindFirst.mockResolvedValue({ id: 'task-running' });

        const result = await requestPollDecisionForSubject('subject-1');

        expect(result).toEqual({
            status: 'already_running',
            taskId: 'task-running',
            cityId: CITY_ID,
            meetingId: MEETING_ID,
        });
        expect(mockStartTask).not.toHaveBeenCalled();
    });
});
