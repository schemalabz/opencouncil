/** @jest-environment node */

import { handleTaskUpdate } from '@/lib/tasks/tasks';
import type { TaskUpdate } from '@/lib/apiTypes';
import { sendTaskAdminAlert } from '@/lib/discord';

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
jest.mock('@/lib/tasks/registry', () => ({ taskHandlers: {}, taskTerminalHooks: {} }));

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

describe('handleTaskUpdate — failures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(baseTask);
    mockUpdate.mockResolvedValue({ ...baseTask, status: 'failed' });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('marks the task failed and alerts when the processor rejects with undefined', async () => {
    // The claim already set the task succeeded. If the catch throws while it
    // reads the rejection, the failed-status write never runs.
    const processResult = jest.fn().mockRejectedValue(undefined);
    const update: TaskUpdate<{ foo: string }> = { status: 'success', stage: '', progressPercent: 100, result: { foo: 'bar' }, version: 13 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: expect.objectContaining({ status: 'failed', version: 13 }),
    });
    expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'undefined' }));
  });

  it('keeps the payload in responseBody and stores the handler error in failureReason', async () => {
    const result = { foo: 'bar', n: 42 };
    const processorErr = new Error('boom');
    processorErr.stack = 'Error: boom\n    at processor';
    const processResult = jest.fn().mockRejectedValue(processorErr);
    const update: TaskUpdate<typeof result> = { status: 'success', stage: '', progressPercent: 100, result, version: 7 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    // The claim stores the payload before the handler runs.
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: { not: 'succeeded' } },
      data: { status: 'succeeded', responseBody: JSON.stringify(result), failureReason: null, version: 7 },
    });
    // The failure write leaves responseBody alone, so a replay can use it.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: { status: 'failed', failureReason: 'Error: boom\n    at processor', version: 7 },
    });
    expect(processResult).toHaveBeenCalledWith(TASK_ID, result, undefined);
  });

  it('stores a non-Error rejection as text in failureReason', async () => {
    const processResult = jest.fn().mockRejectedValue('plain string failure');
    const update: TaskUpdate<{ foo: string }> = { status: 'success', stage: '', progressPercent: 100, result: { foo: 'bar' }, version: 13 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TASK_ID },
      data: { status: 'failed', failureReason: 'plain string failure', version: 13 },
    });
  });

  it('writes nothing after the claim on a clean success', async () => {
    const processResult = jest.fn().mockResolvedValue(undefined);
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('stores the task-server error in failureReason and leaves responseBody alone', async () => {
    const processResult = jest.fn();
    const update: TaskUpdate<never> = { status: 'error', stage: '', progressPercent: 100, error: 'backend failed', version: 11 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: { notIn: ['succeeded', 'failed'] } },
      data: { status: 'failed', failureReason: 'backend failed', version: 11 },
    });
    expect(processResult).not.toHaveBeenCalled();
  });
});
