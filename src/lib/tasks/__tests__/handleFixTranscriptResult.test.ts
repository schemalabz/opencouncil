/** @jest-environment node */

const mockTaskFindUnique = jest.fn();
const mockTaskFindFirst = jest.fn();
const mockUtteranceFindUnique = jest.fn();
const mockUtteranceUpdate = jest.fn();
const mockUtteranceEditCreate = jest.fn();
const mockApplySpeakerHints = jest.fn();
const mockAutoTriggerTask = jest.fn();
const mockRequestFixFromMinutes = jest.fn();

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
jest.mock('../autoTrigger', () => ({ autoTriggerTask: (...args: unknown[]) => mockAutoTriggerTask(...args) }));
jest.mock('../fixFromMinutesInternal', () => ({ requestFixFromMinutesInternal: (...args: unknown[]) => mockRequestFixFromMinutes(...args) }));

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
      data: { utteranceId: 'u1', beforeText: 'Λάθος.', afterText: 'Διορθωμένο.', editedBy: 'task', taskId: 'task-1' },
    });
    expect(mockApplySpeakerHints).toHaveBeenCalledWith('task-1', result.speakerHints);
  });

  it('looks for a later transcribe, fixTranscript or fixFromMinutes run of the same meeting whose result has arrived', async () => {
    await handleFixTranscriptResult('task-1', result);

    // A later run counts from the moment its payload is in, not only once its
    // handler has finished and the status reads succeeded.
    expect(mockTaskFindFirst.mock.calls[0][0].where).toEqual({
      cityId: 'city-1',
      councilMeetingId: 'meeting-1',
      OR: [{ status: 'succeeded' }, { responseBody: { not: null } }],
      type: { in: ['transcribe', 'fixTranscript', 'fixFromMinutes'] },
      createdAt: { gt: TASK_CREATED },
    });
  });

  it('chains fixFromMinutes when the meeting has the municipal minutes, and not otherwise', async () => {
    mockAutoTriggerTask.mockImplementation(async (_type: string, _context: unknown, trigger: () => Promise<unknown>) => { await trigger(); return 'started'; });
    await handleFixTranscriptResult('task-1', result);
    expect(mockAutoTriggerTask).not.toHaveBeenCalled();

    mockTaskFindUnique.mockResolvedValue({
      cityId: 'city-1', councilMeetingId: 'meeting-1', createdAt: TASK_CREATED,
      councilMeeting: {
        municipalMinutesUrl: 'https://example.com/minutes.pdf',
        name: null, name_en: null, kind: null, urgent: false, sessionNumber: null, dateTime: TASK_CREATED,
        city: { name_en: 'City', timezone: 'Europe/Athens' }, administrativeBody: null,
      },
    });
    await handleFixTranscriptResult('task-1', result);
    expect(mockAutoTriggerTask).toHaveBeenCalledWith(
      'fixFromMinutes',
      expect.objectContaining({ cityId: 'city-1', meetingId: 'meeting-1', source: { taskType: 'fixTranscript', taskId: 'task-1' } }),
      expect.any(Function),
    );
    expect(mockRequestFixFromMinutes).toHaveBeenCalledWith('meeting-1', 'city-1', { force: true });
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
