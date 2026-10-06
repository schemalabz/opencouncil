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

describe('handleTaskUpdate — a result handler that fails', () => {
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
});
