/** @jest-environment node */

/**
 * Tests for the summarize cleanup and force semantics.
 *
 * The `force` flag on requestSummarize controls ONLY idempotency — whether
 * the task is allowed to run again if it already succeeded. It does NOT
 * control cleanup.
 *
 * Cleanup of stale data (topic labels, utterance discussion statuses) always
 * happens in handleSummarizeResult when a successful callback is received.
 * This ensures the DB stays consistent: old data is only removed when we
 * have new data to replace it with. If the task fails, old data is preserved.
 */

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';
const TASK_ID = 'task-1';

const mockTopicLabelDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockUtteranceUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
const mockTransaction = jest.fn().mockResolvedValue([]);
const mockTaskStatusFindUnique = jest.fn().mockResolvedValue({
  id: TASK_ID,
  councilMeeting: {
    id: MEETING_ID,
    cityId: CITY_ID,
    city: { name_en: 'TestCity' },
    name: 'Test Meeting',
    administrativeBody: null,
  },
});
const mockTopicFindMany = jest.fn().mockResolvedValue([]);
const mockUtteranceFindMany = jest.fn().mockResolvedValue([]);
const mockUtteranceUpdate = jest.fn().mockResolvedValue({});

jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockTaskStatusFindUnique(...args),
    },
    topicLabel: {
      deleteMany: (...args: unknown[]) => mockTopicLabelDeleteMany(...args),
    },
    utterance: {
      updateMany: (...args: unknown[]) => mockUtteranceUpdateMany(...args),
      findMany: (...args: unknown[]) => mockUtteranceFindMany(...args),
      update: (...args: unknown[]) => mockUtteranceUpdate(...args),
    },
    topic: {
      findMany: (...args: unknown[]) => mockTopicFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockGetAvailableSpeakerSegmentIds = jest.fn().mockResolvedValue([]);
const mockSaveSubjectsForMeeting = jest.fn().mockResolvedValue(new Map());
const mockGetSummarizeRequestBody = jest.fn().mockResolvedValue({ transcript: [] });
jest.mock('../../db/utils', () => ({
  getAvailableSpeakerSegmentIds: (...args: unknown[]) => mockGetAvailableSpeakerSegmentIds(...args),
  saveSubjectsForMeeting: (...args: unknown[]) => mockSaveSubjectsForMeeting(...args),
  getSummarizeRequestBody: (...args: unknown[]) => mockGetSummarizeRequestBody(...args),
}));

const mockStartTask = jest.fn().mockResolvedValue({ id: TASK_ID });
jest.mock('../tasks', () => ({
  startTask: (...args: unknown[]) => mockStartTask(...args),
}));

jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: jest.fn().mockResolvedValue(undefined),
}));

import { requestSummarize, handleSummarizeResult } from '../summarize';
import { SummarizeResult } from '../../apiTypes';

const EMPTY_RESPONSE: SummarizeResult = {
  speakerSegmentSummaries: [],
  subjects: [],
  utteranceDiscussionStatuses: [],
};

describe('requestSummarize — force controls idempotency only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes force:false to startTask by default (idempotency enforced)', async () => {
    await requestSummarize(CITY_ID, MEETING_ID);

    expect(mockStartTask).toHaveBeenCalledWith(
      'summarize',
      expect.anything(),
      MEETING_ID,
      CITY_ID,
      { force: false },
    );
  });

  it('passes force:true to startTask when requested (idempotency bypassed)', async () => {
    await requestSummarize(CITY_ID, MEETING_ID, [], undefined, { force: true });

    expect(mockStartTask).toHaveBeenCalledWith(
      'summarize',
      expect.anything(),
      MEETING_ID,
      CITY_ID,
      { force: true },
    );
  });

  it('never does cleanup, even with force:true', async () => {
    await requestSummarize(CITY_ID, MEETING_ID, [], undefined, { force: true });

    expect(mockTopicLabelDeleteMany).not.toHaveBeenCalled();
    expect(mockUtteranceUpdateMany).not.toHaveBeenCalled();
  });
});

describe('handleSummarizeResult — always cleans up stale data on success', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes topic labels scoped to the meeting segments', async () => {
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockTopicLabelDeleteMany).toHaveBeenCalledWith({
      where: {
        speakerSegmentId: { in: [] },
      },
    });
  });

  it('resets utterance discussion statuses scoped to the meeting segments', async () => {
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockUtteranceUpdateMany).toHaveBeenCalledWith({
      where: {
        speakerSegmentId: { in: [] },
      },
      data: {
        discussionStatus: null,
        discussionSubjectId: null,
      },
    });
  });

  it('passes the cleanup ops into the same $transaction array (atomicity)', async () => {
    // Sentinel return values so we can assert by identity that the cleanup ops are
    // ELEMENTS of the array handed to $transaction — not awaited separately before it.
    // A sequential-await version would still call all three mocks, so asserting only
    // "was called" wouldn't actually guard the atomicity invariant this PR introduces.
    const deleteOp = Symbol('deleteTopicLabels');
    const resetOp = Symbol('resetUtterances');
    mockTopicLabelDeleteMany.mockReturnValueOnce(deleteOp);
    mockUtteranceUpdateMany.mockReturnValueOnce(resetOp);

    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockTransaction).toHaveBeenCalled();
    const [transactionArg] = mockTransaction.mock.calls[0];
    expect(transactionArg).toContain(deleteOp);
    expect(transactionArg).toContain(resetOp);
  });

  it('builds cleanup before saving new data', async () => {
    const callOrder: string[] = [];
    mockTopicLabelDeleteMany.mockImplementation(() => { callOrder.push('deleteTopicLabels'); return Promise.resolve({ count: 0 }); });
    mockUtteranceUpdateMany.mockImplementation(() => { callOrder.push('resetUtterances'); return Promise.resolve({ count: 0 }); });
    mockTransaction.mockImplementation(() => { callOrder.push('saveTransaction'); return Promise.resolve([]); });
    mockSaveSubjectsForMeeting.mockImplementation(() => { callOrder.push('saveSubjects'); return Promise.resolve(new Map()); });

    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(callOrder.indexOf('deleteTopicLabels')).toBeLessThan(callOrder.indexOf('saveTransaction'));
    expect(callOrder.indexOf('resetUtterances')).toBeLessThan(callOrder.indexOf('saveTransaction'));
    expect(callOrder.indexOf('deleteTopicLabels')).toBeLessThan(callOrder.indexOf('saveSubjects'));
    expect(callOrder.indexOf('resetUtterances')).toBeLessThan(callOrder.indexOf('saveSubjects'));
  });
});
