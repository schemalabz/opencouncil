/** @jest-environment node */

/**
 * The browser-callable task entry points take a caller-supplied city, meeting or
 * task id. These tests fail if one of them ever reaches the work without the gate.
 */
const mockWithRight = jest.fn();
const mockTaskFindUnique = jest.fn();
const mockStartTask = jest.fn();
const mockHandler = jest.fn();

jest.mock('@/lib/notifications/meetingNotifications', () => ({ notifySubscribersOfTask: jest.fn() }));
jest.mock('../../auth', () => ({
  withRight: (...args: unknown[]) => mockWithRight(...args),
}));
jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: { taskStatus: { findUnique: (...args: unknown[]) => mockTaskFindUnique(...args), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } },
}));
jest.mock('../fixTranscriptInternal', () => ({
  requestFixTranscriptInternal: (...args: unknown[]) => mockStartTask(...args),
}));
jest.mock('../registry', () => ({
  taskHandlers: { transcribe: (...args: unknown[]) => mockHandler(...args) },
  taskTerminalHooks: {},
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../discord', () => ({ sendTaskAdminAlert: jest.fn() }));

import { requestFixTranscript } from '../fixTranscript';
import { processTaskResponse } from '../tasks';

beforeEach(() => {
  jest.clearAllMocks();
  mockWithRight.mockResolvedValue(true);
  mockTaskFindUnique.mockResolvedValue({
    id: 'task-1', type: 'transcribe', status: 'failed', cityId: 'other-city', councilMeetingId: 'other-meeting', responseBody: '{}',
  });
});

describe('requestFixTranscript', () => {
  it('authorizes the caller for the meeting it was handed', async () => {
    await requestFixTranscript('meeting-1', 'city-1');
    expect(mockWithRight).toHaveBeenCalledWith('tasks.run', { cityId: 'city-1', councilMeetingId: 'meeting-1' });
  });

  it('starts no task when the caller is not authorized', async () => {
    mockWithRight.mockRejectedValue(new Error('Not authorized'));
    await expect(requestFixTranscript('meeting-1', 'city-1')).rejects.toThrow('Not authorized');
    expect(mockStartTask).not.toHaveBeenCalled();
  });
});

describe('processTaskResponse', () => {
  it("authorizes against the task's own meeting, not one the caller supplies", async () => {
    await processTaskResponse('transcribe', 'task-1');
    expect(mockWithRight).toHaveBeenCalledWith('tasks.run', { cityId: 'other-city', councilMeetingId: 'other-meeting' });
  });

  it("asks the right of the stored type: the poll replay is the records keeper's, on the meeting", async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 'task-1', type: 'pollDecisions', cityId: 'other-city', councilMeetingId: 'other-meeting', responseBody: '{}' });
    await processTaskResponse('pollDecisions', 'task-1').catch(() => undefined);
    expect(mockWithRight).toHaveBeenCalledWith('records.edit', { cityId: 'other-city', councilMeetingId: 'other-meeting' });
  });

  it("asks the right of the stored type: the voiceprint replay is the admin's, on the city", async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 'task-1', type: 'generateVoiceprint', cityId: 'other-city', councilMeetingId: 'other-meeting', responseBody: '{}' });
    await processTaskResponse('generateVoiceprint', 'task-1').catch(() => undefined);
    expect(mockWithRight).toHaveBeenCalledWith('admin', { cityId: 'other-city' });
  });

  it("authorizes against the task's city when the task has no meeting", async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 'task-1', type: 'transcribe', status: 'failed', cityId: 'other-city', councilMeetingId: null, responseBody: '{}' });
    await processTaskResponse('transcribe', 'task-1');
    expect(mockWithRight).toHaveBeenCalledWith('tasks.run', { cityId: 'other-city' });
  });

  it('runs no handler when the caller is not authorized', async () => {
    mockWithRight.mockRejectedValue(new Error('Not authorized'));
    await expect(processTaskResponse('transcribe', 'task-1')).rejects.toThrow('Not authorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  // The gate checks the stored type. A caller who names another type could
  // otherwise run a city-only handler on a task of their meeting.
  it('refuses a type that differs from the stored one', async () => {
    await expect(processTaskResponse('pollDecisions', 'task-1')).rejects.toThrow('is a transcribe task, not pollDecisions');
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
