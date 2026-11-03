/** @jest-environment node */

import { encodeMediaFailureResponse, MEDIA_FAILURE_RESPONSE_PREFIX } from '../mediaMetadata';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import type { TaskUpdate } from '@/lib/apiTypes';
import { sendTaskAdminAlert } from '@/lib/discord';

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();

const mockNotify = jest.fn();
jest.mock('@/lib/notifications/meetingNotifications', () => ({ notifySubscribersOfTask: (...args: unknown[]) => mockNotify(...args) }));
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
  stage: 'enrichment',
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
    // The claim stored the payload and the task is still pending. If the catch
    // throws while it reads the rejection, the failed-status write never runs.
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

    // The claim stores the payload before the handler runs, and leaves the
    // status pending: a task reads as succeeded only once its results are written.
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: { not: 'succeeded' }, responseBody: null },
      data: { status: 'pending', responseBody: JSON.stringify(result), stage: 'persisting results', failureReason: null, version: 7 },
    });
    // The failure write leaves responseBody alone, so a replay can use it, and
    // the succeeded write never runs.
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

  it('marks the task succeeded only after the handler has written its results', async () => {
    const processResult = jest.fn().mockResolvedValue(undefined);
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    // The stage returns to the task server's last report once the claim is done.
    expect(mockUpdateMany).toHaveBeenLastCalledWith({
      where: { id: TASK_ID },
      data: { status: 'succeeded', stage: 'enrichment' },
    });
    // Claim, then handler, then the flip: the order is the whole point. A
    // reader of `succeeded` (the Notis event feed) must find the rows written.
    expect(mockUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(processResult.mock.invocationCallOrder[0]);
    expect(processResult.mock.invocationCallOrder[0]).toBeLessThan(mockUpdateMany.mock.invocationCallOrder[1]);
  });

  it('notifies the subscribers of a news phase only after the flip, with its own phase', async () => {
    for (const type of ['summarize', 'processAgenda']) {
      jest.clearAllMocks();
      mockFindUnique.mockResolvedValue({ ...baseTask, type });
      mockUpdateMany.mockResolvedValue({ count: 1 });
      const processResult = jest.fn().mockResolvedValue(undefined);
      const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };

      await handleTaskUpdate(TASK_ID, update, processResult);

      expect(mockNotify).toHaveBeenCalledWith('city-1', 'meeting-1', type);
      // After the flip: a release only counts succeeded tasks, so this order is what keeps exactly one of the two from missing the other.
      expect(mockUpdateMany.mock.invocationCallOrder[1]).toBeLessThan(mockNotify.mock.invocationCallOrder[0]);
    }
  });

  it('does not notify for a task type that is not news, or when the flip fails', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTask, type: 'transcribe' });
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };
    await handleTaskUpdate(TASK_ID, update, jest.fn().mockResolvedValue(undefined));
    expect(mockNotify).not.toHaveBeenCalled();

    mockFindUnique.mockResolvedValue(baseTask);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('connection reset'));
    await handleTaskUpdate(TASK_ID, update, jest.fn().mockResolvedValue(undefined));
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('does not notify when the handler throws', async () => {
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };
    await handleTaskUpdate(TASK_ID, update, jest.fn().mockRejectedValue(new Error('boom')));
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('a failed flip after written results is logged, not recorded as a handler failure', async () => {
    const processResult = jest.fn().mockResolvedValue(undefined);
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('connection reset'));
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    // No failed-status write: the rows are there. The completion alert still goes out.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('a success callback without a result is claimed by the status itself', async () => {
    const processResult = jest.fn();
    const update: TaskUpdate<undefined> = { status: 'success', stage: '', progressPercent: 100, result: undefined, version: 2 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: { not: 'succeeded' }, responseBody: null },
      data: { status: 'succeeded', failureReason: null, version: 2 },
    });
    expect(processResult).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(sendTaskAdminAlert).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('ignores a retried success callback once the payload is claimed, even while the task is still pending', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const processResult = jest.fn();
    const update: TaskUpdate<{ ok: number }> = { status: 'success', stage: '', progressPercent: 100, result: { ok: 1 }, version: 3 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    expect(processResult).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(sendTaskAdminAlert).not.toHaveBeenCalled();
  });

  it('stores the task-server error in failureReason and leaves responseBody alone', async () => {
    const processResult = jest.fn();
    const update: TaskUpdate<never> = { status: 'error', stage: '', progressPercent: 100, error: 'backend failed', version: 11 };

    await handleTaskUpdate(TASK_ID, update, processResult);

    // A late error callback never fails a task whose result already arrived.
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: { notIn: ['succeeded', 'failed'] }, responseBody: null },
      data: { status: 'failed', failureReason: 'backend failed', version: 11 },
    });
    expect(processResult).not.toHaveBeenCalled();
  });
});


describe('media callback metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue({ ...baseTask, type: 'transcribe' });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });
  it('stores a source failure in the guarded error claim, without a result body', async () => {
    const mediaFailure = { reason: 'login_required' as const, retryable: false, hint: 'Use a public recording.' };
    await handleTaskUpdate(TASK_ID, { status: 'error', stage: '', progressPercent: 0, version: 6, error: 'Sign in required', mediaFailure }, jest.fn());
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, status: { notIn: ['succeeded', 'failed'] }, responseBody: null },
      data: { status: 'failed', failureReason: 'Sign in required', version: 6, responseBody: encodeMediaFailureResponse(mediaFailure) },
    });
  });
  it('claims source metadata with the replayable success payload', async () => {
    const result = { source: { kind: 'yt-dlp', title: 'Council' } };
    await handleTaskUpdate(TASK_ID, { status: 'success', stage: '', progressPercent: 100, version: 6, result }, jest.fn());
    expect(mockUpdateMany.mock.calls[0][0].data).toMatchObject({ responseBody: JSON.stringify(result) });
  });
  it('does not expose media data on other tasks or persist malformed metadata', async () => {
    mockFindUnique.mockResolvedValue(baseTask);
    await handleTaskUpdate(TASK_ID, { status: 'error', stage: '', progressPercent: 0, version: 6, mediaFailure: { reason: 'error', retryable: true } }, jest.fn());
    expect(mockUpdateMany.mock.calls[0][0].data).not.toHaveProperty('mediaFailure');
  });
});

it('sanitizes source URLs in both metadata and the replayable callback payload', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTask, type: 'transcribe' });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const result = { transcript: 'kept', source: { kind: 'file', webpageUrl: 'https://u:p@video.test/watch?v=public&token=secret#fragment' } };
    await handleTaskUpdate(TASK_ID, { status: 'success', stage: '', progressPercent: 100, version: 6, result }, jest.fn());
    const claim = mockUpdateMany.mock.calls.at(-2)[0].data;
    expect(JSON.parse(claim.responseBody)).toEqual({ transcript: 'kept', source: { kind: 'file', webpageUrl: 'https://video.test/watch?v=public' } });
});

it('admits a late transcribe success atomically even when its initial read preceded the source failure', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTask, type: 'transcribe', responseBody: null });
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await handleTaskUpdate(TASK_ID, { status: 'success', stage: '', progressPercent: 100, version: 6, result: { source: { kind: 'file' } } }, jest.fn());
    expect(mockUpdateMany.mock.calls.at(-2)[0].where).toEqual({ id: TASK_ID, status: { not: 'succeeded' }, OR: [
        { responseBody: null }, { status: 'failed', responseBody: { startsWith: MEDIA_FAILURE_RESPONSE_PREFIX } },
    ] });
});

it('rejects a success payload that uses the reserved failure discriminator before claiming it', async () => {
    mockFindUnique.mockResolvedValue({ ...baseTask, type: 'transcribe' });
    mockUpdateMany.mockClear();
    await expect(handleTaskUpdate(TASK_ID, { status: 'success', stage: '', progressPercent: 100, version: 6,
        result: { $opencouncilTaskResponse: 'media-source-failure-v1', mediaFailure: { reason: 'error', retryable: true } } }, jest.fn())).rejects.toThrow('reserved');
    expect(mockUpdateMany).not.toHaveBeenCalled();
});
