/** @jest-environment node */

/**
 * The browser-callable task entry points take a caller-supplied city, meeting or
 * task id. These tests fail if one of them ever reaches the work without the gate.
 */
const mockWithUserAuthorizedToEdit = jest.fn();
const mockTaskFindUnique = jest.fn();
const mockStartTask = jest.fn();
const mockHandler = jest.fn();

jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
}));
jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: { taskStatus: { findUnique: (...args: unknown[]) => mockTaskFindUnique(...args) } },
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
  mockWithUserAuthorizedToEdit.mockResolvedValue(true);
  mockTaskFindUnique.mockResolvedValue({
    id: 'task-1', type: 'transcribe', cityId: 'other-city', responseBody: '{}',
  });
});

describe('requestFixTranscript', () => {
  it('authorizes the caller for the city it was handed', async () => {
    await requestFixTranscript('meeting-1', 'city-1');
    expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'city-1' });
  });

  it('starts no task when the caller is not authorized', async () => {
    mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));
    await expect(requestFixTranscript('meeting-1', 'city-1')).rejects.toThrow('Not authorized');
    expect(mockStartTask).not.toHaveBeenCalled();
  });
});

describe('processTaskResponse', () => {
  it("authorizes against the task's own city, not one the caller supplies", async () => {
    await processTaskResponse('transcribe', 'task-1');
    expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'other-city' });
  });

  it('runs no handler when the caller is not authorized', async () => {
    mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));
    await expect(processTaskResponse('transcribe', 'task-1')).rejects.toThrow('Not authorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
