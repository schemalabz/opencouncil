/** @jest-environment node */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findFirst: jest.fn(),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: jest.fn(),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../discord', () => ({ sendTaskAdminAlert: jest.fn() }));
jest.mock('../registry', () => ({ taskHandlers: {}, taskTerminalHooks: {} }));

import { handleTaskUpdate } from '../tasks';
import type { TaskUpdate } from '../../apiTypes';

const TASK_ID = 'task-1';

const baseTask = {
  id: TASK_ID,
  type: 'summarize',
  status: 'pending',
  cityId: 'city-1',
  councilMeetingId: 'meeting-1',
  createdAt: new Date(),
  councilMeeting: { name_en: 'M', city: { name_en: 'C' } },
};

describe('handleTaskUpdate — persist raw payload before processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(baseTask);
    mockUpdate.mockResolvedValue({ ...baseTask, status: 'succeeded' });
  });

  it('writes responseBody first, then leaves it untouched when processor throws and stores processingError', async () => {
    const result = { foo: 'bar', n: 42 };
    const processorErr = new Error('boom');
    const processResult = jest.fn().mockRejectedValue(processorErr);

    const update: TaskUpdate<typeof result> = { status: 'success', stage: '', progressPercent: 100, result, version: 7 };
    await handleTaskUpdate(TASK_ID, update, processResult);

    // First update: success branch persists raw payload BEFORE processing.
    expect(mockUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: TASK_ID },
      data: {
        status: 'succeeded',
        responseBody: JSON.stringify(result),
        processingError: null,
        version: 7,
      },
    });

    // Second update: processor failed → status flips to failed, processingError set,
    // and responseBody is NOT overwritten (so the raw payload survives for replay).
    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: TASK_ID },
      data: expect.objectContaining({
        status: 'failed',
        processingError: expect.stringContaining('boom'),
        version: 7,
      }),
    });
    const secondCallArg = mockUpdate.mock.calls[1][0] as { data: Record<string, unknown> };
    expect(secondCallArg.data).not.toHaveProperty('responseBody');

    expect(processResult).toHaveBeenCalledWith(TASK_ID, result, undefined);
  });

  it('clears processingError on a clean success', async () => {
    const processResult = jest.fn().mockResolvedValue(undefined);
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };
    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: {
        status: 'succeeded',
        responseBody: JSON.stringify({ ok: 1 }),
        processingError: null,
        version: 3,
      },
    });
  });

  it('stores processor stack without duplicating the error message', async () => {
    const result = { foo: 'bar' };
    const processorErr = new Error('boom');
    processorErr.stack = 'Error: boom\n    at processor';
    const processResult = jest.fn().mockRejectedValue(processorErr);

    const update: TaskUpdate<typeof result> = { status: 'success', stage: '', progressPercent: 100, result, version: 9 };
    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: TASK_ID },
      data: expect.objectContaining({
        processingError: 'Error: boom\n    at processor',
      }),
    });
  });

  it('clears stale processingError when backend reports an error', async () => {
    const processResult = jest.fn();
    const update: TaskUpdate<never> = { status: 'error', stage: '', progressPercent: 100, error: 'backend failed', version: 11 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: {
        status: 'failed',
        responseBody: 'backend failed',
        processingError: null,
        version: 11,
      },
    });
    expect(processResult).not.toHaveBeenCalled();
  });
});
