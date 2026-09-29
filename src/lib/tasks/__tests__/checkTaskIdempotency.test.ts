/** @jest-environment node */

const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

// Mock all transitive dependencies of tasks.ts before import
const mockExecuteRaw = jest.fn().mockResolvedValue(0);
// startTask admits a task inside a transaction; the same stub serves as the
// transaction client, so the tests see the lock, the reads and the create.
const prismaStub = {
  $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(prismaStub),
  taskStatus: {
    findFirst: (...args: unknown[]) => mockFindFirst(...args),
    findUnique: (...args: unknown[]) => mockFindUnique(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};
jest.mock('../../db/prisma', () => ({ __esModule: true, default: prismaStub }));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', NEXTAUTH_SECRET: 'test-secret', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
// The exclusion rule has its own test; here every step is free to start.
jest.mock('../pipelineRules', () => ({ findConflictingTask: jest.fn().mockResolvedValue(null) }));
jest.mock('../../discord', () => ({
  sendTaskAdminAlert: jest.fn(),
}));
const mockTerminalHook = jest.fn().mockResolvedValue(undefined);
jest.mock('../registry', () => ({
  taskHandlers: {},
  taskTerminalHooks: { pollDecisions: (...args: unknown[]) => mockTerminalHook(...args) },
}));

import { checkTaskIdempotency, startTask, handleTaskUpdate } from '../tasks';
import { TaskAlreadyExistsError } from '../types';
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
    // Should have checked both running and succeeded
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it('blocks when a running task exists', async () => {
    mockFindFirst.mockResolvedValueOnce(runningTask);

    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result).toEqual({
      proceed: false,
      existingTask: runningTask,
      blockedReason: 'already_running',
    });
    // Should NOT check for succeeded tasks — running takes priority
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it('blocks when a succeeded task exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result).toEqual({
      proceed: false,
      existingTask: succeededTask,
      blockedReason: 'already_succeeded',
    });
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it('prioritizes running over succeeded when both exist', async () => {
    mockFindFirst.mockResolvedValueOnce(runningTask);

    const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID);

    expect(result.blockedReason).toBe('already_running');
    expect(result.existingTask).toBe(runningTask);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  describe('force option', () => {
    it('skips the succeeded check when force is true', async () => {
      const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID, { force: true });

      expect(result).toEqual({ proceed: true, existingTask: null });
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('lets a re-run through when a succeeded task exists, without reading it', async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID, { force: true });

      expect(result.proceed).toBe(true);
      // Only the running read: the succeeded row would block, and force skips it.
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('never lets a second run start beside a running one', async () => {
      mockFindFirst.mockResolvedValueOnce(runningTask);

      const result = await checkTaskIdempotency('summarize', CITY_ID, MEETING_ID, { force: true });

      expect(result).toEqual({ proceed: false, existingTask: runningTask, blockedReason: 'already_running' });
    });
  });

  describe('query correctness', () => {
    it('queries running tasks with correct filters', async () => {
      await checkTaskIdempotency('transcribe', CITY_ID, MEETING_ID);

      expect(mockFindFirst).toHaveBeenNthCalledWith(1, {
        where: {
          councilMeetingId: MEETING_ID,
          cityId: CITY_ID,
          type: 'transcribe',
          status: { notIn: ['failed', 'succeeded'] },
        },
      });
    });

    it('queries succeeded tasks with correct filters and ordering', async () => {
      await checkTaskIdempotency('transcribe', CITY_ID, MEETING_ID);

      expect(mockFindFirst).toHaveBeenNthCalledWith(2, {
        where: {
          councilMeetingId: MEETING_ID,
          cityId: CITY_ID,
          type: 'transcribe',
          status: 'succeeded',
        },
        orderBy: { createdAt: 'desc' },
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
    mockFindFirst.mockResolvedValueOnce(null); // no running
    mockFindFirst.mockResolvedValueOnce(succeededTask);

    await expect(startTask('summarize', {}, MEETING_ID, CITY_ID))
      .rejects.toThrow('already succeeded');
  });

  // autoTriggerTask tells a benign duplicate from a real failure with instanceof, so
  // the type of the error is the contract — the message alone cannot carry it
  it.each([
    ['already_running', () => mockFindFirst.mockResolvedValueOnce(runningTask)],
    ['already_succeeded', () => {
      mockFindFirst.mockResolvedValueOnce(null);
      mockFindFirst.mockResolvedValueOnce(succeededTask);
    }],
  ] as const)('reports a blocked pipeline task as TaskAlreadyExistsError (%s)', async (reason, arrange) => {
    arrange();

    const error = await startTask('summarize', {}, MEETING_ID, CITY_ID).catch((e) => e);

    expect(error).toBeInstanceOf(TaskAlreadyExistsError);
    expect(error.reason).toBe(reason);
    expect(error.taskType).toBe('summarize');
  });

  it('enforces idempotency for pipeline tasks (e.g. transcribe)', async () => {
    mockFindFirst.mockResolvedValueOnce(runningTask);

    await expect(startTask('transcribe', {}, MEETING_ID, CITY_ID))
      .rejects.toThrow('already running');
  });

  it('admits under the lock of the meeting, before any read, and creates inside the same transaction', async () => {
    await startTask('summarize', {}, MEETING_ID, CITY_ID);

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw.mock.calls[0].flat().join(' ')).toContain(`${CITY_ID}:${MEETING_ID}`);
    expect(mockExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(mockFindFirst.mock.invocationCallOrder[0]);
    expect(mockFindFirst.mock.invocationCallOrder[0]).toBeLessThan(mockCreate.mock.invocationCallOrder[0]);
  });

  it('lets tasks that run per highlight, person or poll start beside each other', async () => {
    // Even with a running task in the DB, these proceed without a read
    mockFindFirst.mockResolvedValue(runningTask);

    await startTask('generateHighlight', {}, MEETING_ID, CITY_ID);
    await startTask('generateVoiceprint', {}, MEETING_ID, CITY_ID);
    await startTask('pollDecisions', {}, MEETING_ID, CITY_ID);

    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('holds processAgenda to the same rules as the pipeline steps', async () => {
    mockFindFirst.mockResolvedValueOnce(runningTask);
    await expect(startTask('processAgenda', {}, MEETING_ID, CITY_ID)).rejects.toThrow('already running');

    // A run that found no subjects still succeeded: a repeat needs force.
    mockFindFirst.mockResolvedValueOnce(null);
    mockFindFirst.mockResolvedValueOnce(succeededTask);
    await expect(startTask('processAgenda', {}, MEETING_ID, CITY_ID)).rejects.toThrow('already succeeded');

    mockFindFirst.mockResolvedValueOnce(null);
    await startTask('processAgenda', {}, MEETING_ID, CITY_ID, { force: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('lets force repeat a succeeded pipeline task, and never a running one', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await startTask('transcribe', {}, MEETING_ID, CITY_ID, { force: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    mockFindFirst.mockResolvedValueOnce(runningTask);
    await expect(startTask('transcribe', {}, MEETING_ID, CITY_ID, { force: true })).rejects.toThrow('already running');
    expect(mockCreate).toHaveBeenCalledTimes(1);
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

describe('startTask — pipeline exclusion', () => {
    it('refuses a step beside a running step it excludes, before it creates anything, force or not', async () => {
        const { findConflictingTask } = jest.requireMock('../pipelineRules') as { findConflictingTask: jest.Mock };
        findConflictingTask.mockResolvedValueOnce({ id: 't9', type: 'transcribe' });
        const { startTask } = await import('../tasks');
        const { PipelineBusyError } = await import('../types');
        await expect(startTask('summarize', {}, 'm1', 'athens', { force: true })).rejects.toThrow(PipelineBusyError);
        expect(findConflictingTask).toHaveBeenCalledWith('summarize', 'athens', 'm1', prismaStub);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
