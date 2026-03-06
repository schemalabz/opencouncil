/** @jest-environment node */

const mockFindUnique = jest.fn();
const mockTaskStatusFindMany = jest.fn();
const mockSendBatchStarted = jest.fn().mockResolvedValue(undefined);
const mockSendBatchCompleted = jest.fn().mockResolvedValue(undefined);

jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockTaskStatusFindMany(...args),
      create: jest.fn(),
      update: jest.fn(),
    },
    subject: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    decision: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) => fn({
      decision: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      subject: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    })),
  },
}));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../../discord', () => ({
  sendTaskAdminAlert: jest.fn(),
  sendPollDecisionsBatchStartedAlert: (...args: unknown[]) => mockSendBatchStarted(...args),
  sendPollDecisionsBatchCompletedAlert: (...args: unknown[]) => mockSendBatchCompleted(...args),
}));
jest.mock('../registry', () => ({ taskHandlers: {}, taskTerminalHooks: {} }));

import { checkBatchCompletionAndAlert } from '../pollDecisions';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';
const TASK_CREATED_AT = new Date('2026-03-06T10:00:00Z');

/** Helper to build a responseBody with _processedCounts */
function enrichedResponseBody(raw: Record<string, unknown>, counts: { matches: number; reassignments: number; conflicts: number }) {
  return JSON.stringify({ ...raw, _processedCounts: counts });
}

describe('checkBatchCompletionAndAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends batch alert when all sibling tasks are terminal', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's1', ada: 'ADA1', pdfUrl: 'http://pdf' }], reassignments: [], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 1, reassignments: 0, conflicts: 0 },
        ),
      },
      {
        id: 'task-2',
        status: 'succeeded',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's2' }, { subjectId: 's3' }], reassignments: [], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 2, reassignments: 0, conflicts: 0 },
        ),
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledTimes(1);
    expect(mockSendBatchCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        succeededCount: 2,
        failedCount: 0,
        totalMatches: 3,
        totalReassignments: 0,
        totalConflicts: 0,
      })
    );
  });

  it('does not send alert when some sibling tasks are still pending', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: '{}',
      },
      {
        id: 'task-2',
        status: 'pending',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: null,
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).not.toHaveBeenCalled();
  });

  it('sends alert immediately for single task (manual trigger)', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's1' }], reassignments: [], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 1, reassignments: 0, conflicts: 0 },
        ),
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledTimes(1);
    expect(mockSendBatchCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        succeededCount: 1,
        failedCount: 0,
        totalMatches: 1,
      })
    );
  });

  it('includes failure info in batch alert for mixed results', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's1' }], reassignments: [], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 1, reassignments: 0, conflicts: 0 },
        ),
      },
      {
        id: 'task-2',
        status: 'failed',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: 'Connection timeout to Diavgeia',
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledTimes(1);
    const callArg = mockSendBatchCompleted.mock.calls[0][0];
    expect(callArg.succeededCount).toBe(1);
    expect(callArg.failedCount).toBe(1);
    expect(callArg.meetingBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cityId: 'city-2',
          meetingId: 'meeting-2',
          status: 'failed',
          error: 'Connection timeout to Diavgeia',
        }),
      ])
    );
  });

  it('aggregates conflicts across all tasks from _processedCounts', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's1' }], reassignments: [{ ada: 'ADA1' }], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 1, reassignments: 1, conflicts: 2 },
        ),
      },
      {
        id: 'task-2',
        status: 'succeeded',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's2' }], reassignments: [], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 1, reassignments: 0, conflicts: 1 },
        ),
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        totalMatches: 2,
        totalReassignments: 1,
        totalConflicts: 3, // 2 from task-1 + 1 from task-2
      })
    );
  });

  it('falls back to raw response counts when _processedCounts is absent', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: JSON.stringify({
          matches: [{ subjectId: 's1' }, { subjectId: 's2' }],
          reassignments: [{ ada: 'ADA1' }],
          unmatchedSubjects: [],
          ambiguousSubjects: [],
        }),
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        totalMatches: 2,
        totalReassignments: 1,
        totalConflicts: 0, // not available without _processedCounts
      })
    );
  });

  it('handles malformed responseBody gracefully', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: 'not json',
      },
      {
        id: 'task-2',
        status: 'succeeded',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: null,
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledTimes(1);
    expect(mockSendBatchCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        succeededCount: 2,
        totalMatches: 0,
      })
    );
  });

  it('reports correct counts for server-level error (last task in batch)', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'succeeded',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: enrichedResponseBody(
          { matches: [{ subjectId: 's1' }], reassignments: [], unmatchedSubjects: [], ambiguousSubjects: [] },
          { matches: 1, reassignments: 0, conflicts: 0 },
        ),
      },
      {
        id: 'task-2',
        status: 'failed',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: 'Server error: worker timeout',
      },
    ]);

    await checkBatchCompletionAndAlert('task-2', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledTimes(1);
    const callArg = mockSendBatchCompleted.mock.calls[0][0];
    expect(callArg.succeededCount).toBe(1);
    expect(callArg.failedCount).toBe(1);
    expect(callArg.totalMatches).toBe(1);
    expect(callArg.meetingBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'failed', error: 'Server error: worker timeout' }),
      ])
    );
  });

  it('reports all failed when entire batch fails', async () => {
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'failed',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: 'Processing error: DB timeout',
      },
      {
        id: 'task-2',
        status: 'failed',
        cityId: 'city-2',
        councilMeetingId: 'meeting-2',
        responseBody: 'Server error: OOM',
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    expect(mockSendBatchCompleted).toHaveBeenCalledTimes(1);
    const callArg = mockSendBatchCompleted.mock.calls[0][0];
    expect(callArg.succeededCount).toBe(0);
    expect(callArg.failedCount).toBe(2);
    expect(callArg.totalMatches).toBe(0);
    expect(callArg.meetingBreakdown).toHaveLength(2);
    expect(callArg.meetingBreakdown.every((m: { status: string }) => m.status === 'failed')).toBe(true);
  });

  it('truncates long error messages in breakdown', async () => {
    const longError = 'x'.repeat(500);
    mockTaskStatusFindMany.mockResolvedValue([
      {
        id: 'task-1',
        status: 'failed',
        cityId: CITY_ID,
        councilMeetingId: MEETING_ID,
        responseBody: longError,
      },
    ]);

    await checkBatchCompletionAndAlert('task-1', TASK_CREATED_AT);

    const callArg = mockSendBatchCompleted.mock.calls[0][0];
    const failedMeeting = callArg.meetingBreakdown.find((m: { status: string }) => m.status === 'failed');
    expect(failedMeeting.error.length).toBe(200); // ERROR_PREVIEW_LENGTH
  });
});
