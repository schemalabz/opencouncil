/** @jest-environment node */

const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

// Mock all transitive dependencies of tasks.ts before import
jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../discord', () => ({
  sendTaskStartedAdminAlert: jest.fn(),
  sendTaskCompletedAdminAlert: jest.fn(),
  sendTaskFailedAdminAlert: jest.fn(),
}));
jest.mock('../registry', () => ({ taskHandlers: {} }));

import { checkTaskIdempotency, startTask } from '../tasks';

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
