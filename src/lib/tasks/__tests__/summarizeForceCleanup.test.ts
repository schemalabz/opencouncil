/** @jest-environment node */

import { requestSummarize, handleSummarizeResult } from '../summarize';
import { SummarizeResult } from '../../apiTypes';

/**
 * Tests for the summarize cleanup and force semantics.
 *
 * The `force` flag on requestSummarize controls ONLY idempotency — whether
 * the task is allowed to run again if it already succeeded. It does NOT
 * control cleanup.
 *
 * Stale topic labels and discussion statuses are removed when a successful
 * callback arrives, never when the task is requested. handleSummarizeResult
 * deletes the labels in its summaries transaction. It hands the statuses to
 * saveSubjectsForMeeting, which these tests mock, so only that hand-over is
 * checked here. tests/integration/task-handlers.test.ts fails each
 * transaction against a real database and checks that nothing is lost.
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
const mockSetMeetingReleasedWithEffects = jest.fn().mockResolvedValue({});
jest.mock('../../db/meetings', () => ({
  getCouncilMeeting: jest.fn(),
  setMeetingReleasedWithEffects: (...args: unknown[]) => mockSetMeetingReleasedWithEffects(...args),
}));
const mockHasSummary = jest.fn().mockResolvedValue(false);
jest.mock('../../db/tasksInternal', () => ({
  meetingHasSucceededTask: (...args: unknown[]) => mockHasSummary(...args),
}));
jest.mock('../../db/utils', () => ({
  getAvailableSpeakerSegmentIds: (...args: unknown[]) => mockGetAvailableSpeakerSegmentIds(...args),
  saveSubjectsForMeeting: (...args: unknown[]) => mockSaveSubjectsForMeeting(...args),
  getSummarizeRequestBody: (...args: unknown[]) => mockGetSummarizeRequestBody(...args),
}));

const mockStartTask = jest.fn().mockResolvedValue({ id: TASK_ID });
const mockGenerateImagesForMeeting = jest.fn().mockResolvedValue(undefined);
jest.mock('../../subjectImages', () => ({
  generateImagesForMeeting: (...args: unknown[]) => mockGenerateImagesForMeeting(...args),
}));

const mockAfter = jest.fn();
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (fn: () => unknown) => mockAfter(fn),
}));

jest.mock('../tasks', () => ({
  startTask: (...args: unknown[]) => mockStartTask(...args),
}));

jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: jest.fn().mockResolvedValue(undefined),
}));

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

describe('handleSummarizeResult — replaces stale data on success', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules the subject illustrations with after(), once the subjects are saved', async () => {
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    // Scheduled, not started: the work must outlive the response, not escape it.
    expect(mockGenerateImagesForMeeting).not.toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockAfter.mock.invocationCallOrder[0]).toBeGreaterThan(mockSaveSubjectsForMeeting.mock.invocationCallOrder[0]);

    await mockAfter.mock.calls[0][0]();
    expect(mockGenerateImagesForMeeting).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
  });

  it('deletes the topic labels of the meeting', async () => {
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockTopicLabelDeleteMany).toHaveBeenCalledWith({
      where: {
        speakerSegment: { meetingId: MEETING_ID, cityId: CITY_ID },
      },
    });
  });

  it('hands the response statuses to saveSubjectsForMeeting and does not reset them itself', async () => {
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith([], CITY_ID, MEETING_ID, []);
    expect(mockUtteranceUpdateMany).not.toHaveBeenCalled();
  });

  it('hands an empty list, not undefined, for a response without statuses', async () => {
    const legacyResponse: SummarizeResult = { speakerSegmentSummaries: [], subjects: [] };

    await handleSummarizeResult(TASK_ID, legacyResponse);

    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith([], CITY_ID, MEETING_ID, []);
  });

  it('passes the topic-label cleanup into the same $transaction array (atomicity)', async () => {
    // Identity check: the delete must be an element of the array, not awaited before it.
    const deleteOp = Symbol('deleteTopicLabels');
    mockTopicLabelDeleteMany.mockReturnValueOnce(deleteOp);

    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockTransaction).toHaveBeenCalled();
    const [transactionArg] = mockTransaction.mock.calls[0];
    expect(transactionArg).toContain(deleteOp);
  });
});

describe('handleSummarizeResult — releases the meeting of a body with no operator (#829)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('releases an unreleased meeting of a secondary body once the summary is saved', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce({
      id: TASK_ID,
      councilMeeting: {
        id: MEETING_ID, cityId: CITY_ID, city: { name_en: 'TestCity' }, name: 'Test Meeting', released: false,
        administrativeBody: { type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' },
      },
    });

    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockSetMeetingReleasedWithEffects).toHaveBeenCalledWith(CITY_ID, MEETING_ID, true);
  });

  it('leaves a hidden meeting that has a summary already as it is: an admin hid it', async () => {
    mockHasSummary.mockResolvedValueOnce(true);
    mockTaskStatusFindUnique.mockResolvedValueOnce({
      id: TASK_ID,
      councilMeeting: {
        id: MEETING_ID, cityId: CITY_ID, city: { name_en: 'TestCity' }, name: 'Test Meeting', released: false,
        administrativeBody: { type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' },
      },
    });

    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockHasSummary).toHaveBeenCalledWith(CITY_ID, MEETING_ID, 'summarize');
    expect(mockSetMeetingReleasedWithEffects).not.toHaveBeenCalled();
  });

  it('leaves the meeting of a primary body, and a meeting that is public already, as they are', async () => {
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);
    mockTaskStatusFindUnique.mockResolvedValueOnce({
      id: TASK_ID,
      councilMeeting: {
        id: MEETING_ID, cityId: CITY_ID, city: { name_en: 'TestCity' }, name: 'Test Meeting', released: true,
        administrativeBody: { type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' },
      },
    });
    await handleSummarizeResult(TASK_ID, EMPTY_RESPONSE);

    expect(mockSetMeetingReleasedWithEffects).not.toHaveBeenCalled();
  });
});
