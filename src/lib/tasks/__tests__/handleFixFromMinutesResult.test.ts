/** @jest-environment node */

const mockTaskFindUnique = jest.fn();
const mockTaskFindFirst = jest.fn();
const mockMeetingUpdate = jest.fn();
const mockUtteranceFindUnique = jest.fn();
const mockUtteranceUpdate = jest.fn();
const mockUtteranceEditCreate = jest.fn();
const mockApplySpeakerHints = jest.fn();
const mockAutoTriggerTask = jest.fn();
const mockRequestSummarize = jest.fn();
const mockStartTask = jest.fn();
const mockGetRequestBody = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        taskStatus: {
            findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
            findFirst: (...args: unknown[]) => mockTaskFindFirst(...args),
        },
        councilMeeting: { update: (...args: unknown[]) => mockMeetingUpdate(...args) },
        utterance: {
            findUnique: (...args: unknown[]) => mockUtteranceFindUnique(...args),
            update: (...args: unknown[]) => mockUtteranceUpdate(...args),
        },
        utteranceEdit: { create: (...args: unknown[]) => mockUtteranceEditCreate(...args) },
    },
}));
jest.mock('@/lib/db/utils', () => ({
    getFixTranscriptRequestBody: jest.fn(),
    getFixFromMinutesRequestBody: (...args: unknown[]) => mockGetRequestBody(...args),
}));
jest.mock('@/lib/tasks/tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('../speakerHints', () => ({ applySpeakerHints: (...args: unknown[]) => mockApplySpeakerHints(...args) }));
jest.mock('../autoTrigger', () => ({ autoTriggerTask: (...args: unknown[]) => mockAutoTriggerTask(...args) }));
jest.mock('../summarizeInternal', () => ({ requestSummarizeInternal: (...args: unknown[]) => mockRequestSummarize(...args) }));

import { handleFixFromMinutesResult, requestFixFromMinutesInternal } from '../fixFromMinutesInternal';
import type { FixFromMinutesResult } from '@/lib/apiTypes';

const TASK_CREATED = new Date('2026-10-16T10:10:00Z');
const task = {
    id: 'task-1',
    cityId: 'city-1',
    councilMeetingId: 'meeting-1',
    createdAt: TASK_CREATED,
    councilMeeting: {
        name: null, name_en: null, kind: 'ordinary', urgent: false, sessionNumber: 20, dateTime: new Date('2026-10-07T16:00:00Z'),
        city: { name_en: 'Papagou', timezone: 'Europe/Athens' },
        administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council' },
    },
};
const result: FixFromMinutesResult = {
    updateUtterances: [{ utteranceId: 'u1', text: 'Ο κ. Λέκκας.', markUncertain: false, source: { page: 4, label: 'ΠΡΟΕΔΡΟΣ', turnIndex: 12 } }],
    speakerHints: [{ speakerTagId: 't1', personId: 'anna', actionable: true, evidenceKind: null, confidence: 97, evidence: 'ΠΡΟΕΔΡΟΣ 97% (00:01:10–00:48:02)' }],
    report: {
        document: { section: null, coverage: 0.99, checkAdded: 2, checkRemoved: 0, checkDropped: 0, checkFailedChunks: 0 },
        alignment: { turns: 189, alignedTurns: 180, turnsUnderGate: 8, utterancesUnmatched: 30 },
        corrections: { utterancesChanged: 1, substitutions: 1, insertionsSkipped: 40, deletionsSkipped: 55 },
        speakers: { actionable: 1, contested: [], disagreements: [], unresolvedLabels: ['ΣΥΜΒΟΥΛΟΣ'] },
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTaskFindUnique.mockResolvedValue(task);
    mockTaskFindFirst.mockResolvedValue(null);
    mockUtteranceFindUnique.mockResolvedValue({ id: 'u1', text: 'Ο κ. Νέκας.' });
    mockAutoTriggerTask.mockImplementation(async (_type: string, _context: unknown, trigger: () => Promise<unknown>) => { await trigger(); return 'started'; });
});

describe('handleFixFromMinutesResult', () => {
    it('writes each correction as an edit of this run, stores the minutes opinions, and starts summarize', async () => {
        await handleFixFromMinutesResult('task-1', result);

        expect(mockUtteranceUpdate).toHaveBeenCalledWith({
            where: { id: 'u1' },
            data: { text: 'Ο κ. Λέκκας.', uncertain: false, lastModifiedBy: 'task' },
        });
        expect(mockUtteranceEditCreate).toHaveBeenCalledWith({
            data: { utteranceId: 'u1', beforeText: 'Ο κ. Νέκας.', afterText: 'Ο κ. Λέκκας.', editedBy: 'task', taskId: 'task-1' },
        });
        expect(mockApplySpeakerHints).toHaveBeenCalledWith('task-1', result.speakerHints, 'minutes');
        expect(mockAutoTriggerTask).toHaveBeenCalledWith(
            'summarize',
            expect.objectContaining({ cityId: 'city-1', meetingId: 'meeting-1', source: { taskType: 'fixFromMinutes', taskId: 'task-1' } }),
            expect.any(Function),
        );
        expect(mockRequestSummarize).toHaveBeenCalledWith('city-1', 'meeting-1', [], undefined, { force: true });
    });

    it('ignores a result that a later correction run supersedes, text and speakers alike', async () => {
        mockTaskFindFirst.mockResolvedValue({ id: 'task-2' });

        await handleFixFromMinutesResult('task-1', result);

        expect(mockTaskFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ type: { in: ['transcribe', 'fixTranscript', 'fixFromMinutes'] }, createdAt: { gt: TASK_CREATED } }),
        }));
        expect(mockUtteranceUpdate).not.toHaveBeenCalled();
        expect(mockApplySpeakerHints).not.toHaveBeenCalled();
        expect(mockAutoTriggerTask).not.toHaveBeenCalled();
    });

    it('keeps the text corrections and still summarizes when the speaker opinions fail to apply', async () => {
        mockApplySpeakerHints.mockRejectedValue(new Error('boom'));

        await handleFixFromMinutesResult('task-1', result);

        expect(mockUtteranceUpdate).toHaveBeenCalledTimes(1);
        expect(mockAutoTriggerTask).toHaveBeenCalledTimes(1);
    });

    it('leaves the opinions of an earlier run alone when the pass did not run', async () => {
        await handleFixFromMinutesResult('task-1', { ...result, speakerHints: undefined });

        expect(mockUtteranceUpdate).toHaveBeenCalledTimes(1);
        expect(mockApplySpeakerHints).not.toHaveBeenCalled();
        expect(mockAutoTriggerTask).toHaveBeenCalledTimes(1);
    });

    it('skips an utterance that no longer exists', async () => {
        mockUtteranceFindUnique.mockResolvedValue(null);

        await handleFixFromMinutesResult('task-1', result);

        expect(mockUtteranceUpdate).not.toHaveBeenCalled();
        expect(mockUtteranceEditCreate).not.toHaveBeenCalled();
    });
});

describe('requestFixFromMinutesInternal', () => {
    it('stores a URL it is given on the meeting before it builds the request', async () => {
        mockGetRequestBody.mockResolvedValue({ municipalMinutesUrl: 'https://example.com/minutes.pdf' });

        await requestFixFromMinutesInternal('meeting-1', 'city-1', { force: true, municipalMinutesUrl: 'https://example.com/minutes.pdf' });

        expect(mockMeetingUpdate).toHaveBeenCalledWith({
            where: { cityId_id: { cityId: 'city-1', id: 'meeting-1' } },
            data: { municipalMinutesUrl: 'https://example.com/minutes.pdf' },
        });
        expect(mockStartTask).toHaveBeenCalledWith('fixFromMinutes', { municipalMinutesUrl: 'https://example.com/minutes.pdf' }, 'meeting-1', 'city-1', { force: true });
    });

    it('reads the minutes from the meeting when none is given', async () => {
        mockGetRequestBody.mockResolvedValue({});

        await requestFixFromMinutesInternal('meeting-1', 'city-1');

        expect(mockMeetingUpdate).not.toHaveBeenCalled();
        expect(mockStartTask).toHaveBeenCalledWith('fixFromMinutes', {}, 'meeting-1', 'city-1', { force: undefined });
    });
});
