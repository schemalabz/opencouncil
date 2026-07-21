/** @jest-environment node */

const mockRequestFixTranscript = jest.fn();
const mockSendAutoFixAlert = jest.fn();
const mockTaskFindUnique = jest.fn();
const mockMeetingUpdate = jest.fn();
const mockSpeakerTagCreate = jest.fn();
const mockSpeakerSegmentCreate = jest.fn();

// Mock all transitive dependencies of transcribe.ts before import
jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
    },
    councilMeeting: {
      update: (...args: unknown[]) => mockMeetingUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        person: { findUnique: jest.fn() },
        speakerTag: { create: (...args: unknown[]) => mockSpeakerTagCreate(...args) },
        speakerSegment: { create: (...args: unknown[]) => mockSpeakerSegmentCreate(...args) },
      }),
  },
}));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../transcribeInternal', () => ({
  requestTranscribeInternal: jest.fn(),
  deleteExistingSpeakerData: jest.fn(),
}));
jest.mock('../fixTranscript', () => ({
  requestFixTranscript: (...args: unknown[]) => mockRequestFixTranscript(...args),
}));
jest.mock('../../discord', () => ({
  sendTaskAdminAlert: (...args: unknown[]) => mockSendAutoFixAlert(...args),
}));

import { handleTranscribeResult } from '../transcribe';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

const task = {
  id: 'task-1',
  cityId: CITY_ID,
  councilMeetingId: MEETING_ID,
  councilMeeting: {
    id: MEETING_ID,
    cityId: CITY_ID,
    name_en: 'Test Meeting',
    city: { name_en: 'Test City' },
    speakerSegments: [],
  },
};

// Minimal successful transcribe result: one speaker, one utterance
const response = {
  videoUrl: 'https://cdn.example/video.mp4',
  audioUrl: 'https://cdn.example/audio.mp3',
  muxPlaybackId: 'mux-1',
  transcript: {
    transcription: {
      utterances: [{ start: 0, end: 1, speaker: 0, text: 'hello', drift: 0 }],
      speakers: [{ speaker: 0, match: null }],
    },
  },
};

describe('handleTranscribeResult — fixTranscript auto-chain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskFindUnique.mockResolvedValue(task);
    mockMeetingUpdate.mockResolvedValue({ id: MEETING_ID });
    mockSpeakerTagCreate.mockResolvedValue({ id: 'tag-1' });
    mockSpeakerSegmentCreate.mockResolvedValue({ id: 'segment-1' });
    mockRequestFixTranscript.mockResolvedValue({ id: 'fix-task-1' });
    mockSendAutoFixAlert.mockResolvedValue(undefined);
  });

  it('auto-triggers fixTranscript with force after a successful import', async () => {
    await handleTranscribeResult('task-1', response as never);

    expect(mockRequestFixTranscript).toHaveBeenCalledTimes(1);
    expect(mockRequestFixTranscript).toHaveBeenCalledWith(MEETING_ID, CITY_ID, { force: true });
    expect(mockSendAutoFixAlert).not.toHaveBeenCalled();
  });

  it('does not throw when the fixTranscript trigger fails, and sends a Discord alert', async () => {
    mockRequestFixTranscript.mockRejectedValue(new Error('task server unreachable'));

    // Must resolve: a throw here would mark the succeeded transcribe task as failed
    await expect(handleTranscribeResult('task-1', response as never)).resolves.toBeUndefined();

    expect(mockSendAutoFixAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        taskType: 'fixTranscript',
        cityId: CITY_ID,
        meetingId: MEETING_ID,
        error: expect.stringContaining('task server unreachable'),
      })
    );
  });

  it('stringifies non-Error throws in the alert instead of crashing', async () => {
    mockRequestFixTranscript.mockRejectedValue('ECONNREFUSED');

    await expect(handleTranscribeResult('task-1', response as never)).resolves.toBeUndefined();

    expect(mockSendAutoFixAlert).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('ECONNREFUSED') })
    );
  });

  it('does not throw even when the failure alert itself rejects', async () => {
    mockRequestFixTranscript.mockRejectedValue(new Error('task server unreachable'));
    mockSendAutoFixAlert.mockRejectedValue(new Error('discord down'));

    await expect(handleTranscribeResult('task-1', response as never)).resolves.toBeUndefined();
  });

  it('does not trigger fixTranscript when the import itself fails', async () => {
    mockTaskFindUnique.mockResolvedValue(null); // handler throws 'Task not found'

    await expect(handleTranscribeResult('task-1', response as never)).rejects.toThrow('Task not found');

    expect(mockRequestFixTranscript).not.toHaveBeenCalled();
  });
});
