/** @jest-environment node */

const mockTaskFindFirst = jest.fn();
const mockGetContext = jest.fn();
const mockApplyCorrection = jest.fn();
const mockSetMinutesUrl = jest.fn();
const mockNeverStarted = jest.fn();
const mockApplySpeakerHints = jest.fn();
const mockAutoTriggerTask = jest.fn();
const mockRequestSummarize = jest.fn();
const mockStartTask = jest.fn();
const mockGetRequestBody = jest.fn();

jest.mock('server-only', () => ({}));
// isSupersededCorrection, in fixTranscriptInternal, reads the task rows directly.
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        taskStatus: {
            findUnique: () => Promise.resolve({ cityId: 'city-1', councilMeetingId: 'meeting-1', createdAt: new Date('2026-10-16T10:10:00Z') }),
            findFirst: (...args: unknown[]) => mockTaskFindFirst(...args),
        },
    },
}));
jest.mock('@/lib/db/minutesCorrections', () => ({
    getMinutesTaskContext: (...args: unknown[]) => mockGetContext(...args),
    applyMinutesCorrection: (...args: unknown[]) => mockApplyCorrection(...args),
    setMunicipalMinutesUrl: (...args: unknown[]) => mockSetMinutesUrl(...args),
    minutesCorrectionNeverStarted: (...args: unknown[]) => mockNeverStarted(...args),
}));
jest.mock('@/lib/db/utils', () => ({
    getFixTranscriptRequestBody: jest.fn(),
    getFixFromMinutesRequestBody: (...args: unknown[]) => mockGetRequestBody(...args),
}));
jest.mock('@/lib/tasks/tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('../speakerHints', () => ({ applySpeakerHints: (...args: unknown[]) => mockApplySpeakerHints(...args) }));
jest.mock('../autoTrigger', () => ({ autoTriggerTask: (...args: unknown[]) => mockAutoTriggerTask(...args) }));
jest.mock('../summarizeInternal', () => ({ requestSummarizeInternal: (...args: unknown[]) => mockRequestSummarize(...args) }));

import { handleFixFromMinutesResult, requestFixFromMinutesInternal, startMinutesCorrectionIfDue } from '../fixFromMinutesInternal';
import type { FixFromMinutesResult } from '@/lib/apiTypes';

const CONTEXT = {
    cityId: 'city-1',
    councilMeetingId: 'meeting-1',
    councilMeeting: {
        municipalMinutesUrl: 'https://example.com/minutes.pdf',
        name: null, name_en: null, kind: 'ordinary', urgent: false, sessionNumber: 20, dateTime: new Date('2026-10-07T16:00:00Z'),
        city: { name_en: 'Papagou', timezone: 'Europe/Athens' },
        administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council' },
    },
};
const result: FixFromMinutesResult = {
    updateUtterances: [
        { utteranceId: 'u1', text: 'Ο κ. Λέκκας.', markUncertain: false, source: { page: 4, label: 'ΠΡΟΕΔΡΟΣ', turnIndex: 12 } },
        { utteranceId: 'u2', text: 'Μεσογείων.', markUncertain: false, source: { page: 5, label: 'ΤΡΑΚΑΣ', turnIndex: 13 } },
    ],
    speakerHints: [{ speakerTagId: 't1', personId: 'anna', actionable: true, evidenceKind: null, confidence: 97, evidence: 'ΠΡΟΕΔΡΟΣ 97% (00:01:10–00:48:02)' }],
    report: {
        document: { section: null, coverage: 0.99, checkAdded: 2, checkRemoved: 0, checkDropped: 0, checkFailedChunks: 0 },
        alignment: { turns: 189, alignedTurns: 180, turnsUnderGate: 8, utterancesUnmatched: 30 },
        corrections: { utterancesChanged: 2, substitutions: 2, insertionsSkipped: 40, deletionsSkipped: 55 },
        speakers: { actionable: 1, contested: [], disagreements: [], unresolvedLabels: ['ΣΥΜΒΟΥΛΟΣ'] },
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTaskFindFirst.mockResolvedValue(null);
    mockGetContext.mockResolvedValue(CONTEXT);
    mockApplyCorrection.mockResolvedValue('written');
    mockNeverStarted.mockResolvedValue(true);
    mockAutoTriggerTask.mockImplementation(async (_type: string, _context: unknown, trigger: () => Promise<unknown>) => { await trigger(); return 'started'; });
});

describe('handleFixFromMinutesResult', () => {
    it('writes each correction through the database module, stores the minutes opinions, and starts summarize', async () => {
        await handleFixFromMinutesResult('task-1', result);

        expect(mockApplyCorrection).toHaveBeenNthCalledWith(1, 'task-1', result.updateUtterances[0]);
        expect(mockApplyCorrection).toHaveBeenNthCalledWith(2, 'task-1', result.updateUtterances[1]);
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
            where: expect.objectContaining({ type: { in: ['transcribe', 'fixTranscript', 'fixFromMinutes'] } }),
        }));
        expect(mockApplyCorrection).not.toHaveBeenCalled();
        expect(mockApplySpeakerHints).not.toHaveBeenCalled();
        expect(mockAutoTriggerTask).not.toHaveBeenCalled();
    });

    it('keeps going past corrections kept for a person or on missing utterances', async () => {
        mockApplyCorrection.mockResolvedValueOnce('keptForPerson').mockResolvedValueOnce('utteranceMissing');

        await handleFixFromMinutesResult('task-1', result);

        expect(mockApplyCorrection).toHaveBeenCalledTimes(2);
        expect(mockAutoTriggerTask).toHaveBeenCalledTimes(1);
    });

    it('fails the run when a correction cannot be written with its history row', async () => {
        mockApplyCorrection.mockRejectedValue(new Error('history write failed'));

        await expect(handleFixFromMinutesResult('task-1', result)).rejects.toThrow('history write failed');
        expect(mockAutoTriggerTask).not.toHaveBeenCalled();
    });

    it('keeps the text corrections and still summarizes when the speaker opinions fail to apply', async () => {
        mockApplySpeakerHints.mockRejectedValue(new Error('boom'));

        await handleFixFromMinutesResult('task-1', result);

        expect(mockApplyCorrection).toHaveBeenCalledTimes(2);
        expect(mockAutoTriggerTask).toHaveBeenCalledTimes(1);
    });

    it('leaves the opinions of an earlier run alone when the pass did not run', async () => {
        await handleFixFromMinutesResult('task-1', { ...result, speakerHints: undefined });

        expect(mockApplySpeakerHints).not.toHaveBeenCalled();
        expect(mockAutoTriggerTask).toHaveBeenCalledTimes(1);
    });
});

describe('startMinutesCorrectionIfDue', () => {
    it('after fixTranscript, starts the correction whenever the meeting has its minutes', async () => {
        await startMinutesCorrectionIfDue('fix-1', 'fixTranscript');

        // The fixTranscript row reads succeeded only after its handler returns, so no history check runs.
        expect(mockNeverStarted).not.toHaveBeenCalled();
        expect(mockAutoTriggerTask).toHaveBeenCalledWith(
            'fixFromMinutes',
            expect.objectContaining({ source: { taskType: 'fixTranscript', taskId: 'fix-1' } }),
            expect.any(Function),
        );
        expect(mockStartTask).toHaveBeenCalledWith('fixFromMinutes', undefined, 'meeting-1', 'city-1', { force: true });
    });

    it('after summarize, starts the correction only when none has started on the corrected transcript', async () => {
        await startMinutesCorrectionIfDue('sum-1', 'summarize');
        expect(mockNeverStarted).toHaveBeenCalledWith('city-1', 'meeting-1');
        expect(mockAutoTriggerTask).toHaveBeenCalledWith(
            'fixFromMinutes',
            expect.objectContaining({ source: { taskType: 'summarize', taskId: 'sum-1' } }),
            expect.any(Function),
        );

        mockAutoTriggerTask.mockClear();
        mockNeverStarted.mockResolvedValue(false);
        await startMinutesCorrectionIfDue('sum-2', 'summarize');
        expect(mockAutoTriggerTask).not.toHaveBeenCalled();
    });

    it('does nothing for a meeting without minutes', async () => {
        mockGetContext.mockResolvedValue({ ...CONTEXT, councilMeeting: { ...CONTEXT.councilMeeting, municipalMinutesUrl: null } });

        await startMinutesCorrectionIfDue('fix-1', 'fixTranscript');
        await startMinutesCorrectionIfDue('sum-1', 'summarize');

        expect(mockAutoTriggerTask).not.toHaveBeenCalled();
    });
});

describe('requestFixFromMinutesInternal', () => {
    it('stores a URL it is given on the meeting before it builds the request', async () => {
        mockGetRequestBody.mockResolvedValue({ municipalMinutesUrl: 'https://example.com/minutes.pdf' });

        await requestFixFromMinutesInternal('meeting-1', 'city-1', { force: true, municipalMinutesUrl: 'https://example.com/minutes.pdf' });

        expect(mockSetMinutesUrl).toHaveBeenCalledWith('city-1', 'meeting-1', 'https://example.com/minutes.pdf');
        expect(mockStartTask).toHaveBeenCalledWith('fixFromMinutes', { municipalMinutesUrl: 'https://example.com/minutes.pdf' }, 'meeting-1', 'city-1', { force: true });
    });

    it('reads the minutes from the meeting when none is given', async () => {
        mockGetRequestBody.mockResolvedValue({});

        await requestFixFromMinutesInternal('meeting-1', 'city-1');

        expect(mockSetMinutesUrl).not.toHaveBeenCalled();
        expect(mockStartTask).toHaveBeenCalledWith('fixFromMinutes', {}, 'meeting-1', 'city-1', { force: undefined });
    });
});
