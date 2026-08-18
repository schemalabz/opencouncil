/** @jest-environment node */

/**
 * Tests for the summarize auto-run that follows human review.
 *
 * The reviewer opts in with a checkbox, so markHumanReviewComplete only starts
 * summarize when runSummarize is true. The review itself always completes: a
 * failed trigger produces a Discord alert, never a throw.
 *
 * The review record is written once, but the follow-up actions run on every call,
 * so a retry after a failed follow-up can still finish the job.
 */

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';
const REVIEW_TASK_ID = 'human-review-task-1';

const mockTaskStatusCreate = jest.fn();
const mockMeetingFindUnique = jest.fn();
const mockCheckTaskIdempotency = jest.fn();
const mockRequestSummarize = jest.fn();
const mockSendTaskAdminAlert = jest.fn();
const mockSendTranscriptToMunicipality = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();

jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      create: (...args: unknown[]) => mockTaskStatusCreate(...args),
    },
    councilMeeting: {
      findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args),
    },
  },
}));

jest.mock('../tasks', () => ({
  checkTaskIdempotency: (...args: unknown[]) => mockCheckTaskIdempotency(...args),
}));

jest.mock('../summarize', () => ({
  requestSummarize: (...args: unknown[]) => mockRequestSummarize(...args),
}));

jest.mock('../sendTranscript', () => ({
  sendTranscriptToMunicipality: (...args: unknown[]) => mockSendTranscriptToMunicipality(...args),
}));

jest.mock('../../discord', () => ({
  sendTaskAdminAlert: (...args: unknown[]) => mockSendTaskAdminAlert(...args),
  sendHumanReviewCompletedAdminAlert: jest.fn(),
}));

jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
}));

jest.mock('../../db/reviews', () => ({
  getMeetingReviewStats: jest.fn().mockResolvedValue({ hasReviewers: false }),
}));

jest.mock('next/cache', () => ({
  revalidateTag: jest.fn(),
}));

import { getReviewCompletionState, markHumanReviewComplete } from '../humanReview';
import { TaskAlreadyExistsError } from '../types';

/** checkTaskIdempotency answers for the humanReview task, then for summarize. */
const allowBoth = () => {
  mockCheckTaskIdempotency.mockResolvedValue({ proceed: true, existingTask: null });
};

describe('markHumanReviewComplete — summarize auto-run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps queued mockResolvedValueOnce answers. A test that queues
    // more answers than the code consumes would hand the leftovers to the next test.
    mockCheckTaskIdempotency.mockReset();
    mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
    allowBoth();
    mockTaskStatusCreate.mockResolvedValue({ id: REVIEW_TASK_ID });
    mockMeetingFindUnique.mockResolvedValue({
      id: MEETING_ID,
      cityId: CITY_ID,
      name: 'Test Meeting',
      name_en: 'Test Meeting',
      city: { name_en: 'Test City' },
    });
    mockRequestSummarize.mockResolvedValue({ id: 'summarize-task-1' });
    mockSendTaskAdminAlert.mockResolvedValue(undefined);
    mockSendTranscriptToMunicipality.mockResolvedValue({ success: true });
  });

  it('starts summarize when the reviewer opts in', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: true });

    expect(mockRequestSummarize).toHaveBeenCalledTimes(1);
    expect(mockRequestSummarize).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
    expect(mockSendTaskAdminAlert).not.toHaveBeenCalled();
  });

  it('does not start summarize when the reviewer opts out', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: false });

    expect(mockRequestSummarize).not.toHaveBeenCalled();
  });

  it('does not start summarize when no caller opts in', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID);

    expect(mockRequestSummarize).not.toHaveBeenCalled();
  });

  it('records the manual review time that the reviewer typed', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID, { manualReviewTime: '2h 30m' });

    expect(mockTaskStatusCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestBody: JSON.stringify({ triggeredBy: 'user', manualReviewTime: '2h 30m' }),
        }),
      })
    );
  });

  // startTask owns the idempotency decision and reports it with this error, so a
  // meeting that already has a summarize task must read as a skip, not a failure
  it.each([
    ['already_succeeded'],
    ['already_running'],
  ] as const)('skips summarize without an alert when a summarize task is %s', async (reason) => {
    mockRequestSummarize.mockRejectedValue(new TaskAlreadyExistsError('summarize', reason));

    await markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: true });

    expect(mockSendTaskAdminAlert).not.toHaveBeenCalled();
  });

  it('completes the review and alerts when the summarize trigger fails', async () => {
    mockRequestSummarize.mockRejectedValue(new Error('task server unreachable'));

    // Must resolve: the review is complete, only the follow-up task failed to start
    await expect(
      markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: true })
    ).resolves.toEqual({
      review: { id: REVIEW_TASK_ID },
      followUps: { summarize: 'failed', transcript: 'notRequested' },
    });

    expect(mockSendTaskAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        taskType: 'summarize',
        taskId: REVIEW_TASK_ID,
        cityId: CITY_ID,
        meetingId: MEETING_ID,
        error: expect.stringContaining('task server unreachable'),
      })
    );
  });

  it('still sends the transcript when the summarize trigger fails', async () => {
    mockRequestSummarize.mockRejectedValue(new Error('task server unreachable'));

    await markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: true, sendTranscript: true });

    expect(mockSendTranscriptToMunicipality).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
  });

  it('writes no second review record when the review already completed', async () => {
    const existingTask = { id: 'existing-human-review' };
    mockCheckTaskIdempotency.mockResolvedValueOnce({
      proceed: false,
      existingTask,
      blockedReason: 'already_succeeded',
    });

    await expect(markHumanReviewComplete(CITY_ID, MEETING_ID)).resolves.toEqual(
      expect.objectContaining({ review: existingTask })
    );

    expect(mockTaskStatusCreate).not.toHaveBeenCalled();
  });

  it('runs the follow-ups on a retry after the review record already exists', async () => {
    // The record commits before the follow-ups, so a failure between the two
    // leaves a complete review with no summary and no transcript email. The
    // retry must be able to finish the job.
    mockCheckTaskIdempotency
      .mockResolvedValueOnce({ proceed: false, existingTask: { id: 'existing' }, blockedReason: 'already_succeeded' })
      .mockResolvedValue({ proceed: true, existingTask: null });

    await markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: true, sendTranscript: true });

    expect(mockRequestSummarize).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
    expect(mockSendTranscriptToMunicipality).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
  });

  it('fails when the meeting does not exist', async () => {
    mockMeetingFindUnique.mockResolvedValue(null);

    await expect(markHumanReviewComplete(CITY_ID, MEETING_ID)).rejects.toThrow('not found');
    expect(mockTaskStatusCreate).not.toHaveBeenCalled();
  });

  // The transcript email cannot be recalled, so the gate that holds it needs the
  // same cover as the summarize gate
  it('does not send the transcript when the reviewer opts out', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID, { sendTranscript: false });

    expect(mockSendTranscriptToMunicipality).not.toHaveBeenCalled();
  });

  it('does not send the transcript when no caller opts in', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID);

    expect(mockSendTranscriptToMunicipality).not.toHaveBeenCalled();
  });

  it('sends the transcript when the reviewer opts in', async () => {
    await markHumanReviewComplete(CITY_ID, MEETING_ID, { sendTranscript: true });

    expect(mockSendTranscriptToMunicipality).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
  });

  // The outcomes are the only signal the reviewer gets that a follow-up did not run
  it('reports what each follow-up did', async () => {
    mockSendTranscriptToMunicipality.mockResolvedValue({ success: false, error: 'resend down' });

    const result = await markHumanReviewComplete(CITY_ID, MEETING_ID, {
      runSummarize: true,
      sendTranscript: true,
    });

    expect(result.followUps).toEqual({ summarize: 'started', transcript: 'failed' });
  });

  it('reports a transcript with no recipients as skipped, not failed', async () => {
    mockSendTranscriptToMunicipality.mockResolvedValue({ success: true, skipped: true });

    const result = await markHumanReviewComplete(CITY_ID, MEETING_ID, { sendTranscript: true });

    expect(result.followUps.transcript).toBe('skipped');
  });

  it('reports a summarize task that already exists as skipped, not failed', async () => {
    mockRequestSummarize.mockRejectedValue(new TaskAlreadyExistsError('summarize', 'already_succeeded'));

    const result = await markHumanReviewComplete(CITY_ID, MEETING_ID, { runSummarize: true });

    expect(result.followUps.summarize).toBe('skipped');
  });
});

describe('getReviewCompletionState', () => {
  const meetingWithBody = (released: boolean) => ({
    released,
    administrativeBody: {
      contactEmails: ['clerk@example.gov'],
      name: 'City Council',
      notificationBehavior: 'NOTIFICATIONS_AUTO',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckTaskIdempotency.mockReset();
    mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
    allowBoth();
    mockMeetingFindUnique.mockResolvedValue(meetingWithBody(true));
  });

  it('refuses a caller without edit rights before it reads the meeting', async () => {
    mockWithUserAuthorizedToEdit.mockRejectedValueOnce(new Error('Not authorized'));

    await expect(getReviewCompletionState(CITY_ID, MEETING_ID)).rejects.toThrow('Not authorized');
    expect(mockMeetingFindUnique).not.toHaveBeenCalled();
  });

  it('reports the recipients, the notification behavior and the release state', async () => {
    await expect(getReviewCompletionState(CITY_ID, MEETING_ID)).resolves.toEqual({
      contactEmails: ['clerk@example.gov'],
      administrativeBodyName: 'City Council',
      notificationBehavior: 'NOTIFICATIONS_AUTO',
      summarizeAvailability: 'available',
      released: true,
    });
  });

  it.each([
    ['already_succeeded', 'succeeded'],
    ['already_running', 'running'],
  ] as const)('maps the %s guard to summarize availability %s', async (blockedReason, availability) => {
    mockCheckTaskIdempotency.mockResolvedValue({ proceed: false, existingTask: { id: 'x' }, blockedReason });

    const state = await getReviewCompletionState(CITY_ID, MEETING_ID);

    expect(state.summarizeAvailability).toBe(availability);
  });

  it('reports a meeting without an administrative body as having no recipients', async () => {
    // A real meeting row, so released keeps the value of the meeting
    mockMeetingFindUnique.mockResolvedValue({ released: true, administrativeBody: null });

    await expect(getReviewCompletionState(CITY_ID, MEETING_ID)).resolves.toEqual({
      contactEmails: [],
      administrativeBodyName: null,
      notificationBehavior: null,
      summarizeAvailability: 'available',
      released: true,
    });
  });

  // A missing meeting must not read as a meeting without a body: the dialog would
  // render normally and then fail at confirm time, where markHumanReviewComplete throws
  it('fails when the meeting does not exist', async () => {
    mockMeetingFindUnique.mockResolvedValue(null);

    await expect(getReviewCompletionState(CITY_ID, MEETING_ID)).rejects.toThrow('not found');
  });
});
