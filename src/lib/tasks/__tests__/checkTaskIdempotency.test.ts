/** @jest-environment node */

const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

// Mock all transitive dependencies of tasks.ts before import
jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../discord', () => ({
  sendTaskAdminAlert: jest.fn(),
}));
const mockTerminalHook = jest.fn().mockResolvedValue(undefined);
jest.mock('../registry', () => ({
  taskHandlers: {},
  taskTerminalHooks: { pollDecisions: (...args: unknown[]) => mockTerminalHook(...args) },
}));

import { checkTaskIdempotency, startTask, handleTaskUpdate } from '../tasks';
import { sendTaskAdminAlert } from '../../discord';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

const succeededTask = {
  id: 'task-succeeded',
  type: 'summarize',
  status: 'succeeded',
  cityId: CITY_ID,
  councilMeetingId: MEETING_ID,
  createdAt: new Date(),
};

const runningTask = {
  id: 'task-running',
  type: 'summarize',
  status: 'pending',
  cityId: CITY_ID,
  councilMeetingId: MEETING_ID,
  createdAt: new Date(),
};

describe('checkTaskIdempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing tasks
    mockFindFirst.mockResolvedValue(null);
  });

  it('returns proceed:true when no existing tasks', async () => {
    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result).toEqual({ proceed: true, existingTask: null });
    // Should have checked both succeeded and running
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it('blocks when a succeeded task exists', async () => {
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result).toEqual({
      proceed: false,
      existingTask: succeededTask,
      blockedReason: 'already_succeeded',
    });
    // Should NOT check for running tasks — succeeded takes priority
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it('blocks when a running task exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockFindFirst.mockResolvedValueOnce(runningTask);

    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result).toEqual({
      proceed: false,
      existingTask: runningTask,
      blockedReason: 'already_running',
    });
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it('prioritizes succeeded over running when both exist', async () => {
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result.blockedReason).toBe('already_succeeded');
    expect(result.existingTask).toBe(succeededTask);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  describe('force option', () => {
    it('skips all checks when force is true', async () => {
      const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID, { force: true });

      expect(result).toEqual({ proceed: true, existingTask: null });
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('skips even when succeeded task exists', async () => {
      mockFindFirst.mockResolvedValueOnce(succeededTask);

      const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID, { force: true });

      expect(result.proceed).toBe(true);
      expect(mockFindFirst).not.toHaveBeenCalled();
    });
  });

  describe('query correctness', () => {
    it('queries succeeded tasks with correct filters and ordering', async () => {
      await checkTaskIdempotency('transcribe', CITY_ID, MEETING_ID);

      expect(mockFindFirst).toHaveBeenNthCalledWith(1, {
        where: {
          councilMeetingId: MEETING_ID,
          cityId: CITY_ID,
          type: 'transcribe',
          status: 'succeeded',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('queries running tasks with correct filters', async () => {
      await checkTaskIdempotency('transcribe', CITY_ID, MEETING_ID);

      expect(mockFindFirst).toHaveBeenNthCalledWith(2, {
        where: {
          councilMeetingId: MEETING_ID,
          cityId: CITY_ID,
          type: 'transcribe',
          status: { notIn: ['failed', 'succeeded'] },
        },
      });
    });

    it('passes the correct task type through', async () => {
      await checkTaskIdempotency('humanReview', CITY_ID, MEETING_ID);

      expect(mockFindFirst).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          where: expect.objectContaining({ type: 'humanReview' }),
        })
      );
    });
  });
});

describe('startTask — idempotency scoping', () => {
  const createdTask = {
    id: 'new-task',
    type: 'summarize',
    status: 'pending',
    councilMeeting: { city: { name_en: 'Test City' }, name_en: 'Test Meeting' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(createdTask);
    mockUpdate.mockResolvedValue(createdTask);
    // Mock global fetch for the backend API call
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '{}' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enforces idempotency for pipeline tasks (e.g. summarize)', async () => {
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    await expect(startTask('summarize', {}, MEETING_ID, CITY_ID))
      .rejects.toThrow('already succeeded');
  });

  it('enforces idempotency for pipeline tasks (e.g. transcribe)', async () => {
    // Simulate a running transcribe task
    mockFindFirst.mockResolvedValueOnce(null); // no succeeded
    mockFindFirst.mockResolvedValueOnce(runningTask); // running

    await expect(startTask('transcribe', {}, MEETING_ID, CITY_ID))
      .rejects.toThrow('already running');
  });

  it('skips idempotency for non-pipeline tasks (e.g. generateHighlight)', async () => {
    // Even with a succeeded task in the DB, non-pipeline tasks should proceed
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    // Should NOT throw — idempotency check is skipped entirely
    await startTask('generateHighlight', {}, MEETING_ID, CITY_ID);

    // findFirst should not have been called (no idempotency check)
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('skips idempotency for non-pipeline tasks (e.g. generateVoiceprint)', async () => {
    await startTask('generateVoiceprint', {}, MEETING_ID, CITY_ID);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('skips idempotency for non-pipeline tasks (e.g. splitMediaFile)', async () => {
    await startTask('splitMediaFile', {}, MEETING_ID, CITY_ID);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('allows pipeline tasks with force:true to bypass the guard', async () => {
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    await startTask('transcribe', {}, MEETING_ID, CITY_ID, { force: true });

    // force skips the DB check entirely
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});

describe('startTask — silent option', () => {
  const createdTask = {
    id: 'new-task',
    type: 'summarize',
    status: 'pending',
    councilMeeting: { city: { name_en: 'Test City' }, name_en: 'Test Meeting' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(createdTask);
    mockUpdate.mockResolvedValue(createdTask);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '{}' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends Discord alert by default', async () => {
    await startTask('generateHighlight', {}, MEETING_ID, CITY_ID);

    expect(sendTaskAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'started', taskType: 'generateHighlight' })
    );
  });

  it('suppresses Discord alert when silent: true', async () => {
    await startTask('generateHighlight', {}, MEETING_ID, CITY_ID, { silent: true });

    expect(sendTaskAdminAlert).not.toHaveBeenCalled();
  });

  it('suppresses Discord alert for pollDecisions (discordAlertMode: none)', async () => {
    const pollTask = { ...createdTask, type: 'pollDecisions' };
    mockCreate.mockResolvedValue(pollTask);
    mockUpdate.mockResolvedValue(pollTask);

    await startTask('pollDecisions', {}, MEETING_ID, CITY_ID);

    expect(sendTaskAdminAlert).not.toHaveBeenCalled();
  });
});

describe('handleTaskUpdate — discordAlertMode gating', () => {
  const mockProcessResult = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessResult.mockResolvedValue(undefined);
  });

  it('sends Discord alert for summarize (default alertMode)', async () => {
    const task = {
      id: 'task-1',
      type: 'summarize',
      cityId: CITY_ID,
      councilMeetingId: MEETING_ID,
      councilMeeting: { city: { name_en: 'City' }, name_en: 'Meeting' },
    };
    mockFindUnique.mockResolvedValue(task);
    mockUpdate.mockResolvedValue({ ...task, status: 'succeeded' });

    await handleTaskUpdate(
      'task-1',
      { status: 'success', result: { data: 'test' }, stage: '', progressPercent: 100, version: 1 },
      mockProcessResult,
    );

    expect(sendTaskAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', taskType: 'summarize' })
    );
  });

  it('suppresses Discord alert for pollDecisions success (discordAlertMode: none)', async () => {
    const task = {
      id: 'task-1',
      type: 'pollDecisions',
      cityId: CITY_ID,
      councilMeetingId: MEETING_ID,
      councilMeeting: { city: { name_en: 'City' }, name_en: 'Meeting' },
    };
    mockFindUnique.mockResolvedValue(task);
    mockUpdate.mockResolvedValue({ ...task, status: 'succeeded' });

    await handleTaskUpdate(
      'task-1',
      { status: 'success', result: { matches: [] }, stage: '', progressPercent: 100, version: 1 },
      mockProcessResult,
    );

    expect(sendTaskAdminAlert).not.toHaveBeenCalled();
  });

  it('suppresses Discord alert for pollDecisions failure (discordAlertMode: none)', async () => {
    const task = {
      id: 'task-1',
      type: 'pollDecisions',
      cityId: CITY_ID,
      councilMeetingId: MEETING_ID,
      councilMeeting: { city: { name_en: 'City' }, name_en: 'Meeting' },
    };
    mockFindUnique.mockResolvedValue(task);
    mockUpdate.mockResolvedValue({ ...task, status: 'failed' });

    await handleTaskUpdate(
      'task-1',
      { status: 'error', error: 'some error', stage: '', progressPercent: 0, version: 1 },
      mockProcessResult,
    );

    expect(sendTaskAdminAlert).not.toHaveBeenCalled();
  });

  it('sends Discord alert for summarize failure (default alertMode)', async () => {
    const task = {
      id: 'task-1',
      type: 'summarize',
      cityId: CITY_ID,
      councilMeetingId: MEETING_ID,
      councilMeeting: { city: { name_en: 'City' }, name_en: 'Meeting' },
    };
    mockFindUnique.mockResolvedValue(task);
    mockUpdate.mockResolvedValue({ ...task, status: 'failed' });

    await handleTaskUpdate(
      'task-1',
      { status: 'error', error: 'some error', stage: '', progressPercent: 0, version: 1 },
      mockProcessResult,
    );

    expect(sendTaskAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', taskType: 'summarize' })
    );
  });
});

describe('handleTaskUpdate — terminal hooks', () => {
  const mockProcessResult = jest.fn().mockResolvedValue(undefined);

  const pollDecisionsTask = {
    id: 'task-1',
    type: 'pollDecisions',
    cityId: CITY_ID,
    councilMeetingId: MEETING_ID,
    createdAt: new Date('2026-03-06T10:00:00Z'),
    councilMeeting: { city: { name_en: 'City' }, name_en: 'Meeting' },
  };

  const summarizeTask = {
    id: 'task-2',
    type: 'summarize',
    cityId: CITY_ID,
    councilMeetingId: MEETING_ID,
    createdAt: new Date('2026-03-06T10:00:00Z'),
    councilMeeting: { city: { name_en: 'City' }, name_en: 'Meeting' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessResult.mockResolvedValue(undefined);
  });

  it('calls terminal hook after successful processing', async () => {
    mockFindUnique.mockResolvedValue(pollDecisionsTask);
    mockUpdate.mockResolvedValue({ ...pollDecisionsTask, status: 'succeeded' });

    await handleTaskUpdate(
      'task-1',
      { status: 'success', result: { matches: [] }, stage: '', progressPercent: 100, version: 1 },
      mockProcessResult,
    );

    expect(mockTerminalHook).toHaveBeenCalledTimes(1);
    expect(mockTerminalHook).toHaveBeenCalledWith('task-1', pollDecisionsTask.createdAt);
  });

  it('calls terminal hook after processing failure', async () => {
    mockFindUnique.mockResolvedValue(pollDecisionsTask);
    // First update sets status to 'succeeded' (before processResult runs),
    // second update sets status to 'failed' (in the catch block after processResult throws).
    mockUpdate
      .mockResolvedValueOnce({ ...pollDecisionsTask, status: 'succeeded' })
      .mockResolvedValueOnce({ ...pollDecisionsTask, status: 'failed' });
    mockProcessResult.mockRejectedValue(new Error('DB transaction failed'));

    await handleTaskUpdate(
      'task-1',
      { status: 'success', result: { matches: [] }, stage: '', progressPercent: 100, version: 1 },
      mockProcessResult,
    );

    // Hook still runs — after catch block settles the status to 'failed'
    expect(mockTerminalHook).toHaveBeenCalledTimes(1);
    expect(mockTerminalHook).toHaveBeenCalledWith('task-1', pollDecisionsTask.createdAt);
  });

  it('calls terminal hook after server error', async () => {
    mockFindUnique.mockResolvedValue(pollDecisionsTask);
    mockUpdate.mockResolvedValue({ ...pollDecisionsTask, status: 'failed' });

    await handleTaskUpdate(
      'task-1',
      { status: 'error', error: 'worker timeout', stage: '', progressPercent: 0, version: 1 },
      mockProcessResult,
    );

    expect(mockTerminalHook).toHaveBeenCalledTimes(1);
    expect(mockTerminalHook).toHaveBeenCalledWith('task-1', pollDecisionsTask.createdAt);
  });

  it('does not call terminal hook for processing status', async () => {
    mockFindUnique.mockResolvedValue(pollDecisionsTask);

    await handleTaskUpdate(
      'task-1',
      { status: 'processing', stage: 'matching', progressPercent: 50, version: 1 },
      mockProcessResult,
    );

    expect(mockTerminalHook).not.toHaveBeenCalled();
  });

  it('does not call terminal hook for task types without one', async () => {
    mockFindUnique.mockResolvedValue(summarizeTask);
    mockUpdate.mockResolvedValue({ ...summarizeTask, status: 'succeeded' });

    await handleTaskUpdate(
      'task-2',
      { status: 'success', result: { data: 'test' }, stage: '', progressPercent: 100, version: 1 },
      mockProcessResult,
    );

    expect(mockTerminalHook).not.toHaveBeenCalled();
  });

  it('does not break handleTaskUpdate if terminal hook throws', async () => {
    mockFindUnique.mockResolvedValue(pollDecisionsTask);
    mockUpdate.mockResolvedValue({ ...pollDecisionsTask, status: 'succeeded' });
    mockTerminalHook.mockRejectedValue(new Error('hook crashed'));

    // Should not throw — hook error is caught and logged
    await handleTaskUpdate(
      'task-1',
      { status: 'success', result: { matches: [] }, stage: '', progressPercent: 100, version: 1 },
      mockProcessResult,
    );

    expect(mockTerminalHook).toHaveBeenCalledTimes(1);
  });
});
