/** @jest-environment node */

/**
 * Tests for the force-summarize cleanup logic in requestSummarize.
 *
 * WHY cleanup is needed:
 *
 * handleSummarizeResult uses upserts to save data, but upserts only
 * create/update — they never delete. This creates stale data problems
 * on re-runs:
 *
 * - TopicLabels are upserted with composite key `${speakerSegmentId}_${topicId}`.
 *   If run 1 tags segment-A with ["economy", "environment"] and run 2 tags it
 *   with ["health"], the upsert creates the "health" label but the old "economy"
 *   and "environment" labels remain in the database.
 *
 * - Utterance discussion statuses are set via individual updates for each
 *   utterance in the response. If run 1 sets a status on utterance-X but run 2's
 *   response doesn't include utterance-X, its old status persists.
 *
 * - Summaries are upserted with a unique key on speakerSegmentId (1:1), so
 *   the old value is always overwritten. No cleanup needed.
 *
 * The force path in requestSummarize explicitly deletes topic labels and resets
 * utterance statuses before dispatching the task to ensure a clean slate.
 */

const mockTopicLabelDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockUtteranceUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    topicLabel: {
      deleteMany: (...args: unknown[]) => mockTopicLabelDeleteMany(...args),
    },
    utterance: {
      updateMany: (...args: unknown[]) => mockUtteranceUpdateMany(...args),
    },
  },
}));

const mockGetSummarizeRequestBody = jest.fn().mockResolvedValue({ transcript: [] });
jest.mock('../../db/utils', () => ({
  getSummarizeRequestBody: (...args: unknown[]) => mockGetSummarizeRequestBody(...args),
}));

const mockStartTask = jest.fn().mockResolvedValue({ id: 'task-1' });
jest.mock('../tasks', () => ({
  startTask: (...args: unknown[]) => mockStartTask(...args),
}));

jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: jest.fn().mockResolvedValue(undefined),
}));

import { requestSummarize } from '../summarize';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

describe('requestSummarize — force cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does NOT delete topic labels or reset utterance statuses when force is false', async () => {
    await requestSummarize(CITY_ID, MEETING_ID);

    expect(mockTopicLabelDeleteMany).not.toHaveBeenCalled();
    expect(mockUtteranceUpdateMany).not.toHaveBeenCalled();
  });

  it('does NOT pass force to startTask when force is false', async () => {
    await requestSummarize(CITY_ID, MEETING_ID);

    expect(mockStartTask).toHaveBeenCalledWith(
      'summarize',
      expect.anything(),
      MEETING_ID,
      CITY_ID,
      { force: false },
    );
  });

  it('deletes topic labels scoped to the meeting when force is true', async () => {
    await requestSummarize(CITY_ID, MEETING_ID, [], undefined, { force: true });

    expect(mockTopicLabelDeleteMany).toHaveBeenCalledWith({
      where: {
        speakerSegment: { meetingId: MEETING_ID, cityId: CITY_ID },
      },
    });
  });

  it('resets utterance discussion statuses scoped to the meeting when force is true', async () => {
    await requestSummarize(CITY_ID, MEETING_ID, [], undefined, { force: true });

    expect(mockUtteranceUpdateMany).toHaveBeenCalledWith({
      where: {
        speakerSegment: { meetingId: MEETING_ID, cityId: CITY_ID },
      },
      data: {
        discussionStatus: null,
        discussionSubjectId: null,
      },
    });
  });

  it('passes force:true to startTask to bypass idempotency', async () => {
    await requestSummarize(CITY_ID, MEETING_ID, [], undefined, { force: true });

    expect(mockStartTask).toHaveBeenCalledWith(
      'summarize',
      expect.anything(),
      MEETING_ID,
      CITY_ID,
      { force: true },
    );
  });

  it('cleans up before building the request body', async () => {
    const callOrder: string[] = [];
    mockTopicLabelDeleteMany.mockImplementation(() => { callOrder.push('deleteTopicLabels'); return Promise.resolve({ count: 0 }); });
    mockUtteranceUpdateMany.mockImplementation(() => { callOrder.push('resetUtterances'); return Promise.resolve({ count: 0 }); });
    mockGetSummarizeRequestBody.mockImplementation(() => { callOrder.push('getRequestBody'); return Promise.resolve({ transcript: [] }); });

    await requestSummarize(CITY_ID, MEETING_ID, [], undefined, { force: true });

    expect(callOrder.indexOf('deleteTopicLabels')).toBeLessThan(callOrder.indexOf('getRequestBody'));
    expect(callOrder.indexOf('resetUtterances')).toBeLessThan(callOrder.indexOf('getRequestBody'));
  });
});
