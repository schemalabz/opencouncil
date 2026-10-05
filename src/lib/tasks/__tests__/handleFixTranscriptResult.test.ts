/** @jest-environment node */

const mockTaskFindUnique = jest.fn();
const mockTaskFindFirst = jest.fn();
const mockUtteranceFindUnique = jest.fn();
const mockUtteranceUpdate = jest.fn();
const mockUtteranceEditCreate = jest.fn();
const mockApplySpeakerHints = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
      findFirst: (...args: unknown[]) => mockTaskFindFirst(...args),
    },
    utterance: {
      findUnique: (...args: unknown[]) => mockUtteranceFindUnique(...args),
      update: (...args: unknown[]) => mockUtteranceUpdate(...args),
    },
    utteranceEdit: { create: (...args: unknown[]) => mockUtteranceEditCreate(...args) },
  },
}));
jest.mock('@/lib/db/utils', () => ({ getFixTranscriptRequestBody: jest.fn() }));
jest.mock('@/lib/tasks/tasks', () => ({ startTask: jest.fn() }));
jest.mock('../speakerHints', () => ({ applySpeakerHints: (...args: unknown[]) => mockApplySpeakerHints(...args) }));

import { handleFixTranscriptResult } from '../fixTranscriptInternal';

const TASK_CREATED = new Date('2026-09-18T10:10:00Z');
const result = {
  updateUtterances: [{ utteranceId: 'u1', text: 'Διορθωμένο.', markUncertain: false }],
  speakerHints: [{ speakerTagId: 't1', personId: 'anna', actionable: true, evidenceKind: 'named' as const, confidence: 95, evidence: 'e' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockTaskFindUnique.mockResolvedValue({ cityId: 'city-1', councilMeetingId: 'meeting-1', createdAt: TASK_CREATED });
  mockTaskFindFirst.mockResolvedValue(null);
  mockUtteranceFindUnique.mockResolvedValue({ id: 'u1', text: 'Λάθος.' });
});

describe('handleFixTranscriptResult', () => {
  it('applies the text corrections and the speaker hints of the latest run', async () => {
    await handleFixTranscriptResult('task-1', result);

    expect(mockUtteranceUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { text: 'Διορθωμένο.', uncertain: false, lastModifiedBy: 'task' },
    });
    expect(mockUtteranceEditCreate).toHaveBeenCalledWith({
      data: { utteranceId: 'u1', beforeText: 'Λάθος.', afterText: 'Διορθωμένο.', editedBy: 'task' },
    });
    expect(mockApplySpeakerHints).toHaveBeenCalledWith('task-1', result.speakerHints);
  });

  it('looks for a later succeeded transcribe or fixTranscript run of the same meeting', async () => {
    await handleFixTranscriptResult('task-1', result);

    expect(mockTaskFindFirst.mock.calls[0][0].where).toEqual({
      cityId: 'city-1',
      councilMeetingId: 'meeting-1',
      status: 'succeeded',
      type: { in: ['transcribe', 'fixTranscript'] },
      createdAt: { gt: TASK_CREATED },
    });
  });

  it('ignores a superseded result whole: no old text comes back, no hints are applied', async () => {
    mockTaskFindFirst.mockResolvedValue({ id: 'later-run' });

    await handleFixTranscriptResult('task-1', result);

    expect(mockUtteranceFindUnique).not.toHaveBeenCalled();
    expect(mockUtteranceUpdate).not.toHaveBeenCalled();
    expect(mockUtteranceEditCreate).not.toHaveBeenCalled();
    expect(mockApplySpeakerHints).not.toHaveBeenCalled();
  });

  it('leaves the hints of an earlier run alone when the result carries none', async () => {
    await handleFixTranscriptResult('task-1', { updateUtterances: result.updateUtterances });

    expect(mockUtteranceUpdate).toHaveBeenCalledTimes(1);
    expect(mockApplySpeakerHints).not.toHaveBeenCalled();
  });

  it('keeps the text corrections when applying the hints fails', async () => {
    mockApplySpeakerHints.mockRejectedValue(new Error('boom'));

    await expect(handleFixTranscriptResult('task-1', result)).resolves.toBeUndefined();
    expect(mockUtteranceUpdate).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the task is unknown', async () => {
    mockTaskFindUnique.mockResolvedValue(null);

    await expect(handleFixTranscriptResult('missing', result)).rejects.toThrow('Task not found');
    expect(mockUtteranceUpdate).not.toHaveBeenCalled();
  });
});
