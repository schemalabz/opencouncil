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
import type { PollDecisionsRequest } from '@/lib/apiTypes';
import { dayBounds } from '@/lib/dates/dayBounds';
import type { DecisionConventions } from '@/lib/decisionConventions';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

type SubjectRow = {
    id: string;
    name: string;
    agendaItemTitle: string | null;
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
};

function meetingWith(subjects: SubjectRow[], decisionConventions: unknown = null) {
    return {
        id: MEETING_ID,
        cityId: CITY_ID,
        dateTime: new Date('2026-03-04T18:00:00Z'),
        city: { diavgeiaUid: 'uid-1', timezone: 'Europe/Athens' },
        administrativeBody: { id: 'body-1', name: 'Δημοτικό Συμβούλιο', diavgeiaUnitIds: [], decisionConventions },
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

const CONVENTIONS: DecisionConventions = {
    version: 1,
    rollCallLayout: 'present_and_absent',
    presentListMeaning: 'opening',
    attendanceChangeAnchors: ['agenda_item'],
    statesPerDecisionAttendance: false,
    statesPerVoteAbsence: false,
    usesSubstitutes: false,
    namedVoters: 'dissenters_only',
    mayorStatedSeparately: false,
    provenance: { source: 'manual' },
};

const SUBJECT: SubjectRow = { id: 's1', name: 'Θέμα', agendaItemTitle: null, agendaItemIndex: 1, nonAgendaReason: null };

/** The request body handed to startTask for a meeting of a body with the given record. */
async function requestFor(decisionConventions: unknown, options?: { forceExtract?: boolean }) {
    mockCouncilMeetingFindUnique.mockResolvedValue(meetingWith([SUBJECT], decisionConventions));
    await pollDecisionsForMeeting(CITY_ID, MEETING_ID, options);
    expect(mockStartTask).toHaveBeenCalledTimes(1);
    return mockStartTask.mock.calls[0][1] as Omit<PollDecisionsRequest, 'callbackUrl'>;
}

/**
 * A body with no conventions record gets no extraction: the poll only links its
 * decisions. A page read without the hints would keep that reading.
 */
describe('pollDecisionsForMeeting — extraction waits for a conventions record', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUtteranceGroupBy.mockResolvedValue([]);
        mockDecisionFindMany.mockResolvedValue([]);
        mockDecisionCandidateFindMany.mockResolvedValue([]);
        mockStartTask.mockResolvedValue({ id: 'task-1' });
        mockGetPeopleForMeeting.mockResolvedValue([]);
    });

    it('asks for no extraction when the body has no record', async () => {
        const body = await requestFor(null);
        expect(body.extract).toBe(false);
        expect(body.conventionsText).toBeUndefined();
    });

    it('asks for no extraction when the stored record does not parse', async () => {
        const body = await requestFor({ version: 1, rollCallLayout: 'present_and_absent' });
        expect(body.extract).toBe(false);
    });

    it('asks for no extraction on a forced poll either', async () => {
        const body = await requestFor(null, { forceExtract: true });
        expect(body.extract).toBe(false);
    });

    it('asks for extraction, with the hints, when the body has a record', async () => {
        const body = await requestFor(CONVENTIONS);
        expect(body.extract).toBe(true);
        expect(body.conventionsText).toEqual(expect.any(String));
    });

    it('reads a page it linked without extraction on the first poll after the record exists', async () => {
        // What a gated poll left behind: the decision is linked, with no reading.
        const linked = { ...SUBJECT, discussedIn: null, decision: { ada: 'ΑΔΑ-1', title: 'Απόφαση', pdfUrl: 'https://diavgeia.gov.gr/doc/ΑΔΑ-1', extraction: null, extractorVersion: null } };
        mockCouncilMeetingFindUnique.mockResolvedValue({ ...meetingWith([], CONVENTIONS), subjects: [linked] });
        await pollDecisionsForMeeting(CITY_ID, MEETING_ID);
        const body = mockStartTask.mock.calls[0][1] as Omit<PollDecisionsRequest, 'callbackUrl'>;
        expect(body.extract).toBe(true);
        expect(body.subjects[0].existingDecision).toMatchObject({ ada: 'ΑΔΑ-1', needsExtraction: true });
    });

    it('asks for extraction for a record nobody has confirmed yet', async () => {
        const body = await requestFor({ ...CONVENTIONS, provenance: { source: 'profile', profiledAt: '2026-09-13', documentsSampled: 38 } });
        expect(body.extract).toBe(true);
    });
});

describe('pollDecisionsForMeeting — stored candidates sent to the task', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUtteranceGroupBy.mockResolvedValue([]);
        mockDecisionFindMany.mockResolvedValue([]);
        mockStartTask.mockResolvedValue({ id: 'task-1' });
        mockGetPeopleForMeeting.mockResolvedValue([]);
        mockCouncilMeetingFindUnique.mockResolvedValue(meetingWith([
            { id: 's1', name: 'Θέμα', agendaItemTitle: null, agendaItemIndex: 1, nonAgendaReason: null },
        ]));
    });

    const row = (ada: string, over: Record<string, unknown> = {}) => ({
        ada, meetingDate: new Date('2026-03-04T00:00:00Z'), readStatus: 'ok',
        councilMeetingId: null, decisionId: null, dismissedAt: null, ...over,
    });

    async function knownDecisions() {
        await pollDecisionsForMeeting(CITY_ID, MEETING_ID);
        return (mockStartTask.mock.calls[0][1] as Omit<PollDecisionsRequest, 'callbackUrl'>).knownDecisions;
    }

    it('asks for the window and for the meeting\'s own open candidates', async () => {
        mockDecisionCandidateFindMany.mockResolvedValue([]);
        await knownDecisions();
        const where = mockDecisionCandidateFindMany.mock.calls[0][0].where;
        expect(where.cityId).toBe(CITY_ID);
        expect(where.OR).toEqual(expect.arrayContaining([
            expect.objectContaining({ publishDate: expect.any(Object) }),
            { councilMeetingId: MEETING_ID, decisionId: null, dismissedAt: null },
        ]));
    });

    it('reads the window days in the city\'s zone', async () => {
        mockDecisionCandidateFindMany.mockResolvedValue([]);
        await pollDecisionsForMeeting(CITY_ID, MEETING_ID);
        const { window } = mockStartTask.mock.calls[0][1] as Omit<PollDecisionsRequest, 'callbackUrl'>;
        const where = mockDecisionCandidateFindMany.mock.calls[0][0].where;
        // The meeting is at 20:00 Athens time on 4 March, so the window starts
        // at local midnight of that day, 22:00Z on the 3rd.
        if (!window) throw new Error('the request has no window');
        expect(window.fromDate).toBe('2026-03-04');
        expect(where.OR[0].publishDate).toEqual({
            gte: new Date('2026-03-03T22:00:00.000Z'),
            lte: dayBounds(window.toDate, 'Europe/Athens').end,
        });
    });

    it('marks only an open candidate of this meeting as own', async () => {
        mockDecisionCandidateFindMany.mockResolvedValue([
            row('ΑΔΑ-OPEN', { councilMeetingId: MEETING_ID }),
            row('ΑΔΑ-LINKED', { councilMeetingId: MEETING_ID, decisionId: 'dec-1' }),
            row('ΑΔΑ-DISMISSED', { councilMeetingId: MEETING_ID, dismissedAt: new Date() }),
            row('ΑΔΑ-OTHER', { councilMeetingId: 'meeting-2' }),
        ]);
        const known = await knownDecisions();
        expect(known).toEqual([
            { ada: 'ΑΔΑ-OPEN', meetingDate: '2026-03-04', readStatus: 'ok', own: true },
            { ada: 'ΑΔΑ-LINKED', meetingDate: '2026-03-04', readStatus: 'ok' },
            { ada: 'ΑΔΑ-DISMISSED', meetingDate: '2026-03-04', readStatus: 'ok' },
            { ada: 'ΑΔΑ-OTHER', meetingDate: '2026-03-04', readStatus: 'ok' },
        ]);
    });
});
