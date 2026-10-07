/** @jest-environment node */

import { processTaskResponse } from '@/lib/tasks/tasks';

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/discord', () => ({ sendTaskAdminAlert: jest.fn() }));
const mockSummarizeHandler = jest.fn();
jest.mock('@/lib/tasks/registry', () => ({
  taskHandlers: { summarize: (...args: unknown[]) => mockSummarizeHandler(...args) },
  taskTerminalHooks: {},
}));

const TASK_ID = 'task-1';
const storedResult = { foo: 'bar' };
const storedTask = {
  id: TASK_ID,
  type: 'summarize',
  cityId: 'city-1',
  councilMeetingId: 'meeting-1',
  responseBody: JSON.stringify(storedResult),
};

describe('processTaskResponse — replay of a stored payload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('marks a failed task succeeded and clears failureReason when the replay succeeds', async () => {
    mockFindUnique.mockResolvedValue({ ...storedTask, status: 'failed', failureReason: 'Error: earlier failure' });
    mockSummarizeHandler.mockResolvedValue(undefined);

    await processTaskResponse('summarize', TASK_ID);

    expect(mockSummarizeHandler).toHaveBeenCalledWith(TASK_ID, storedResult, undefined);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: 'failed' },
      data: { status: 'succeeded', failureReason: null },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('records the new failure of a failed task and rethrows when the replay fails', async () => {
    mockFindUnique.mockResolvedValue({ ...storedTask, status: 'failed', failureReason: 'Error: earlier failure' });
    const error = new Error('still broken');
    error.stack = 'Error: still broken\n    at handler';
    mockSummarizeHandler.mockRejectedValue(error);

    await expect(processTaskResponse('summarize', TASK_ID)).rejects.toThrow('still broken');

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: 'failed' },
      data: { failureReason: 'Error: still broken\n    at handler' },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('never demotes a succeeded task whose replay fails', async () => {
    mockFindUnique.mockResolvedValue({ ...storedTask, status: 'succeeded', failureReason: null });
    mockSummarizeHandler.mockRejectedValue(new Error('force re-run broke'));

    await expect(processTaskResponse('summarize', TASK_ID, { force: true })).rejects.toThrow('force re-run broke');

    expect(mockSummarizeHandler).toHaveBeenCalledWith(TASK_ID, storedResult, { force: true });
    // The write is guarded on status 'failed', so it cannot change this row.
    for (const [args] of mockUpdateMany.mock.calls) {
      expect(args.where).toEqual({ id: TASK_ID, status: 'failed' });
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['a pending task', { status: 'pending' }],
    ['a failed task without a payload', { status: 'failed', responseBody: null, failureReason: 'backend failed' }],
    ['a failed task from before failureReason, with failure text in responseBody',
      { status: 'failed', responseBody: 'Processing error: boom', failureReason: null }],
  ])('refuses %s before the handler runs and writes nothing', async (_, overrides) => {
    mockFindUnique.mockResolvedValue({ ...storedTask, ...overrides });

    await expect(processTaskResponse('summarize', TASK_ID)).rejects.toThrow('has no result to replay');

    expect(mockSummarizeHandler).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
