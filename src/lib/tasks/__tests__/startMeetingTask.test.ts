/** @jest-environment node */

const mockMeetingFindUnique = jest.fn();
const mockTaskFindMany = jest.fn();
const mockExecuteRaw = jest.fn();

// The transaction client the admission runs on: the lock query and the task
// read go through it, so the test can see that the lock came first.
const tx = {
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    taskStatus: { findMany: (...args: unknown[]) => mockTaskFindMany(...args) },
};
jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: { findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args) },
        $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
}));
jest.mock('../processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }));
jest.mock('../transcribeInternal', () => ({ requestTranscribeInternal: jest.fn() }));
jest.mock('../fixTranscriptInternal', () => ({ requestFixTranscriptInternal: jest.fn() }));
jest.mock('../summarizeInternal', () => ({ requestSummarizeInternal: jest.fn() }));

import { startMeetingTask } from '../startMeetingTask';
import { requestProcessAgendaInternal } from '../processAgendaInternal';
import { requestTranscribeInternal } from '../transcribeInternal';
import { requestFixTranscriptInternal } from '../fixTranscriptInternal';
import { requestSummarizeInternal } from '../summarizeInternal';
import { PipelineBusyError, TaskAlreadyExistsError } from '../types';
import { ApiError, BadRequestError, ConflictError, NotFoundError } from '../../api/errors';

const TASK = { id: 't1', type: 'transcribe', status: 'pending' };

const meeting = (overrides: object = {}) => ({
    youtubeUrl: 'https://youtu.be/abc',
    agendaUrl: 'https://example.com/agenda.pdf',
    _count: { speakerSegments: 0 },
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockMeetingFindUnique.mockResolvedValue(meeting());
    mockTaskFindMany.mockResolvedValue([]);
    mockExecuteRaw.mockResolvedValue([]);
    for (const fn of [requestProcessAgendaInternal, requestTranscribeInternal, requestFixTranscriptInternal, requestSummarizeInternal]) {
        (fn as jest.Mock).mockResolvedValue(TASK);
    }
});

describe('startMeetingTask', () => {
    it('refuses an unknown meeting', async () => {
        mockMeetingFindUnique.mockResolvedValue(null);
        await expect(startMeetingTask('athens', 'm1', { type: 'transcribe' })).rejects.toThrow(NotFoundError);
    });

    it('transcribes the video of the meeting by default, or the one passed', async () => {
        await startMeetingTask('athens', 'm1', { type: 'transcribe' });
        expect(requestTranscribeInternal).toHaveBeenCalledWith('https://youtu.be/abc', 'm1', 'athens', { force: false });

        await startMeetingTask('athens', 'm1', { type: 'transcribe', videoUrl: 'https://example.com/v.mp4', force: true });
        expect(requestTranscribeInternal).toHaveBeenLastCalledWith('https://example.com/v.mp4', 'm1', 'athens', { force: true });
    });

    it('refuses to transcribe without a video', async () => {
        mockMeetingFindUnique.mockResolvedValue(meeting({ youtubeUrl: null }));
        await expect(startMeetingTask('athens', 'm1', { type: 'transcribe' })).rejects.toThrow(BadRequestError);
        expect(requestTranscribeInternal).not.toHaveBeenCalled();
    });

    it('processes the agenda of the meeting, or refuses without one', async () => {
        await startMeetingTask('athens', 'm1', { type: 'processAgenda' });
        expect(requestProcessAgendaInternal).toHaveBeenCalledWith('https://example.com/agenda.pdf', 'm1', 'athens', { force: false });

        mockMeetingFindUnique.mockResolvedValue(meeting({ agendaUrl: null }));
        await expect(startMeetingTask('athens', 'm1', { type: 'processAgenda' })).rejects.toThrow(BadRequestError);
    });

    it('takes the advisory lock for the meeting before it reads the tasks', async () => {
        await startMeetingTask('athens', 'm1', { type: 'transcribe' });
        expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
        expect(mockExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(mockTaskFindMany.mock.invocationCallOrder[0]);
        // One key per meeting: two different steps must not be admitted together either.
        const key = mockExecuteRaw.mock.calls[0].flat().join(' ');
        expect(key).toContain('athens:m1');
        expect(key).not.toContain('transcribe');
    });

    it('names the way out of a stuck task in the running refusal', async () => {
        mockTaskFindMany.mockResolvedValue([{ status: 'pending' }]);
        await expect(startMeetingTask('athens', 'm1', { type: 'transcribe' })).rejects.toThrow(/\/athens\/m1\/admin/);
    });

    it('reports a step that startTask refused beside a running one as a conflict to wait out', async () => {
        (requestSummarizeInternal as jest.Mock).mockRejectedValue(new PipelineBusyError('summarize', 'transcribe'));
        mockMeetingFindUnique.mockResolvedValue(meeting({ _count: { speakerSegments: 3 } }));
        const failure = startMeetingTask('athens', 'm1', { type: 'summarize', force: true });
        await expect(failure).rejects.toThrow(ConflictError);
        await expect(failure).rejects.toThrow(/transcribe task is still running.*with or without force/);
    });

    it('never starts a step that is still running, with or without force', async () => {
        // A succeeded run exists too: the running one must win.
        mockTaskFindMany.mockResolvedValue([{ status: 'succeeded' }, { status: 'pending' }]);
        await expect(startMeetingTask('athens', 'm1', { type: 'transcribe', force: true })).rejects.toThrow(/already running/);
        await expect(startMeetingTask('athens', 'm1', { type: 'processAgenda' })).rejects.toThrow(/already running/);
        expect(requestTranscribeInternal).not.toHaveBeenCalled();
        expect(requestProcessAgendaInternal).not.toHaveBeenCalled();
        expect(mockTaskFindMany.mock.calls[0][0].where).toMatchObject({ cityId: 'athens', councilMeetingId: 'm1', type: 'transcribe' });
    });

    it('needs force to run a step that succeeded, for every step', async () => {
        mockTaskFindMany.mockResolvedValue([{ status: 'failed' }, { status: 'succeeded' }]);
        await expect(startMeetingTask('athens', 'm1', { type: 'processAgenda' })).rejects.toThrow(/Pass force/);
        await startMeetingTask('athens', 'm1', { type: 'processAgenda', force: true });
        expect(requestProcessAgendaInternal).toHaveBeenCalledWith('https://example.com/agenda.pdf', 'm1', 'athens', { force: true });
    });

    it('lets a typed refusal of a core through as it is', async () => {
        (requestTranscribeInternal as jest.Mock).mockRejectedValue(new ConflictError('The meeting already has a transcript.'));
        await expect(startMeetingTask('athens', 'm1', { type: 'transcribe' })).rejects.toThrow(ConflictError);
    });

    it('needs a transcript for fixTranscript and summarize', async () => {
        await expect(startMeetingTask('athens', 'm1', { type: 'fixTranscript' })).rejects.toThrow(BadRequestError);
        await expect(startMeetingTask('athens', 'm1', { type: 'summarize' })).rejects.toThrow(BadRequestError);

        mockMeetingFindUnique.mockResolvedValue(meeting({ _count: { speakerSegments: 3 } }));
        await startMeetingTask('athens', 'm1', { type: 'summarize', additionalInstructions: 'Focus on the budget' });
        expect(requestSummarizeInternal).toHaveBeenCalledWith('athens', 'm1', [], 'Focus on the budget', { force: false });
        await startMeetingTask('athens', 'm1', { type: 'fixTranscript', force: true });
        expect(requestFixTranscriptInternal).toHaveBeenCalledWith('m1', 'athens', { force: true });
    });

    it('reports a task that landed between the check and the start as a conflict', async () => {
        (requestTranscribeInternal as jest.Mock).mockRejectedValue(new TaskAlreadyExistsError('transcribe', 'already_running'));
        await expect(startMeetingTask('athens', 'm1', { type: 'transcribe' })).rejects.toThrow(ConflictError);
    });

    it('reports a task server refusal to the caller', async () => {
        (requestTranscribeInternal as jest.Mock).mockRejectedValue(new Error('Failed to start task: Bad Gateway (queue full)'));
        const failure = startMeetingTask('athens', 'm1', { type: 'transcribe' });
        await expect(failure).rejects.toBeInstanceOf(ApiError);
        await expect(failure).rejects.toThrow(/queue full/);
    });
});
