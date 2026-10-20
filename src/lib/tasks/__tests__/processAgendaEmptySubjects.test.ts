/** @jest-environment node */

import { handleProcessAgendaResult } from '../processAgenda';
import { ProcessAgendaResult } from '../../apiTypes';

/**
 * Tests for handleProcessAgendaResult subject-handling on empty / malformed
 * success payloads (issue #102).
 *
 * Some agendas (e.g. λογοδοσία / accountability sessions) genuinely have no
 * extractable subjects. The backend reports success with `{ subjects: [] }`,
 * which must be treated as a valid success — the save is still called, and
 * with pruning asked for, so the agenda subjects are cleared. A malformed success payload that omits `subjects` entirely
 * must NOT throw (which would flip the succeeded task to failed) and must NOT
 * delete existing subjects.
 */

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';
const TASK_ID = 'task-1';

const mockHighlightDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockSubjectDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockCouncilMeetingFindUnique = jest.fn().mockResolvedValue({ kind: null });
const mockTaskStatusFindUnique = jest.fn().mockResolvedValue({
  id: TASK_ID,
  councilMeeting: {
    id: MEETING_ID,
    cityId: CITY_ID,
    city: { name_en: 'TestCity', name: 'TestCity' },
    name: 'Test Meeting',
    administrativeBody: null,
  },
});

jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockTaskStatusFindUnique(...args),
    },
    city: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    councilMeeting: {
      findUnique: (...args: unknown[]) => mockCouncilMeetingFindUnique(...args),
    },
    highlight: {
      deleteMany: (...args: unknown[]) => mockHighlightDeleteMany(...args),
    },
    subject: {
      deleteMany: (...args: unknown[]) => mockSubjectDeleteMany(...args),
    },
  },
}));

const mockSaveSubjectsForMeeting = jest.fn().mockResolvedValue(new Map());
jest.mock('../../db/utils', () => ({
  saveSubjectsForMeeting: (...args: unknown[]) => mockSaveSubjectsForMeeting(...args),
}));

jest.mock('../../auth', () => ({
  withUserAuthorizedToEdit: jest.fn().mockResolvedValue(undefined),
}));

const mockGenerateImagesForMeeting = jest.fn().mockResolvedValue(undefined);
jest.mock('../../subjectImages', () => ({
  generateImagesForMeeting: (...args: unknown[]) => mockGenerateImagesForMeeting(...args),
}));

const mockAfter = jest.fn();
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (fn: () => unknown) => mockAfter(fn),
}));

jest.mock('../processAgendaInternal', () => ({
  requestProcessAgendaInternal: jest.fn(),
}));

jest.mock('@/lib/agendaMeetingRecord', () => ({
  checkAgendaIdentity: jest.fn().mockReturnValue({ refusal: null, differences: [] }),
}));

const mockApplyAgendaMeetingRecord = jest.fn().mockResolvedValue({});
jest.mock('../applyAgendaMeetingRecord', () => ({
  applyAgendaMeetingRecord: (...args: unknown[]) => mockApplyAgendaMeetingRecord(...args),
}));

describe('handleProcessAgendaResult — empty / malformed subjects (issue #102)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats { subjects: [] } as a valid success: replaces subjects, does not throw', async () => {
    await expect(
      handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult)
    ).resolves.toBeUndefined();

    // Empty agenda is authoritative → existing subjects are deleted/replaced
    // Pruning lives in the save now, and it is asked for explicitly: the
    // agenda is authoritative, so an empty one clears the agenda subjects.
    expect(mockSubjectDeleteMany).not.toHaveBeenCalled();
    expect(mockHighlightDeleteMany).not.toHaveBeenCalled();
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith([], CITY_ID, MEETING_ID, undefined, {
      pruneUnmatched: true,
    });
  });

  it('schedules the subject illustrations with after(), once the subjects are saved', async () => {
    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);

    // Scheduled, not started: the work must outlive the response, not escape it.
    expect(mockGenerateImagesForMeeting).not.toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockAfter.mock.invocationCallOrder[0]).toBeGreaterThan(mockSaveSubjectsForMeeting.mock.invocationCallOrder[0]);

    await mockAfter.mock.calls[0][0]();
    expect(mockGenerateImagesForMeeting).toHaveBeenCalledWith(CITY_ID, MEETING_ID);
  });

  it('does not throw and does not delete existing subjects when result omits the subjects array', async () => {
    // Malformed/partial success payload (no `subjects` key). Must not throw
    // (would flip the succeeded task to failed) and must preserve existing data.
    await expect(
      handleProcessAgendaResult(TASK_ID, {} as ProcessAgendaResult)
    ).resolves.toBeUndefined();

    expect(mockSubjectDeleteMany).not.toHaveBeenCalled();
    expect(mockHighlightDeleteMany).not.toHaveBeenCalled();
    expect(mockSaveSubjectsForMeeting).not.toHaveBeenCalled();
  });
});

describe('handleProcessAgendaResult — accountability report subject (issue #308)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const meeting = (kind: string | null, firstPartKind?: string | null, dateTime = new Date(Date.now() + 7 * DAY), realm = 'greece') => ({
    id: TASK_ID,
    councilMeeting: {
      id: MEETING_ID,
      cityId: CITY_ID,
      city: { name_en: 'TestCity', name: 'TestCity', name_municipality: 'Δήμος Δοκιμής', realm, timezone: 'Europe/Athens' },
      name: 'Test Meeting',
      kind,
      dateTime,
      continuationOf: firstPartKind === undefined ? null : { kind: firstPartKind },
      administrativeBody: null,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves one high-importance subject when an accountability agenda has no items', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting('accountability'));

    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);

    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledTimes(1);
    const [subjects, cityId, meetingId, , options] = mockSaveSubjectsForMeeting.mock.calls[0];
    expect(cityId).toBe(CITY_ID);
    expect(meetingId).toBe(MEETING_ID);
    expect(options).toEqual({ pruneUnmatched: true });
    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toMatchObject({
      name: 'Λογοδοσία της Δημοτικής Αρχής',
      topicImportance: 'high',
      agendaItemIndex: 1,
    });
  });

  it('saves no subject when an agenda of another kind has no items', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting('ordinary'));
    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith([], CITY_ID, MEETING_ID, undefined, { pruneUnmatched: true });

    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting(null));
    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenLastCalledWith([], CITY_ID, MEETING_ID, undefined, { pruneUnmatched: true });
  });

  it('saves the subject for a later part of an accountability meeting, which takes the kind of its first part', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting(null, 'accountability'));
    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting.mock.calls[0][0]).toHaveLength(1);

    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting(null, 'ordinary'));
    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenLastCalledWith([], CITY_ID, MEETING_ID, undefined, { pruneUnmatched: true });
  });

  it('keeps the extracted subjects of an accountability agenda that has items', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting('accountability'));
    const extracted = [{ name: 'Ερώτημα για το πράσινο', agendaItemIndex: 1, topicImportance: 'normal' }];

    await handleProcessAgendaResult(TASK_ID, { subjects: extracted } as unknown as ProcessAgendaResult);

    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith(extracted, CITY_ID, MEETING_ID, undefined, {
      pruneUnmatched: true,
      retire: [{
        name: 'Λογοδοσία της Δημοτικής Αρχής',
        description: 'Η δημοτική αρχή λογοδοτεί στο δημοτικό συμβούλιο για το έργο της.',
      }],
    });
  });

  it('saves no subject for an accountability meeting that already took place', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting('accountability', undefined, new Date(Date.now() - DAY)));
    await handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith([], CITY_ID, MEETING_ID, undefined, { pruneUnmatched: true });
  });

  // A new meeting has no kind until processAgenda reads its invitation, and
  // the record is written only after the subjects are saved (#856).
  const ITEM = {
    name: 'Λογοδοσία της Δημοτικής Αρχής',
    description: 'Η δημοτική αρχή λογοδοτεί στο δημοτικό συμβούλιο για το έργο της.',
  };
  const read = (kind: string | null) => ({
    kind, kindEvidence: null, urgent: null, urgentEvidence: null, sessionNumber: null, sessionNumberEvidence: null,
  });

  it('saves the subject once the meeting holds the kind, from the record or from an admin', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting(null));
    mockCouncilMeetingFindUnique.mockResolvedValueOnce({ kind: 'accountability' });
    await handleProcessAgendaResult(TASK_ID, { subjects: [], meetingRecord: read('accountability') } as unknown as ProcessAgendaResult);

    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledTimes(2);
    expect(mockSaveSubjectsForMeeting.mock.calls[0][0]).toEqual([]);
    expect(mockSaveSubjectsForMeeting.mock.calls[1][0]).toEqual([expect.objectContaining(ITEM)]);
    expect(mockSaveSubjectsForMeeting.mock.calls[1][4]).toEqual({ pruneUnmatched: true });
  });

  it('saves no subject when the meeting still holds no kind', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting(null));
    await handleProcessAgendaResult(TASK_ID, { subjects: [], meetingRecord: read('accountability') } as unknown as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledTimes(1);
  });

  it('saves no subject when the record takes the kind of a meeting that already took place', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting(null, undefined, new Date(Date.now() - DAY)));
    mockCouncilMeetingFindUnique.mockResolvedValueOnce({ kind: 'accountability' });
    await handleProcessAgendaResult(TASK_ID, { subjects: [], meetingRecord: read('accountability') } as unknown as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledTimes(1);
  });

  it('retires the accountability subject on a numbered re-run, whatever the kind is now', async () => {
    mockTaskStatusFindUnique.mockResolvedValueOnce(meeting('ordinary'));
    const extracted = [{ name: 'Έγκριση μελέτης', agendaItemIndex: 1, topicImportance: 'normal' }];
    await handleProcessAgendaResult(TASK_ID, { subjects: extracted } as unknown as ProcessAgendaResult);
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith(extracted, CITY_ID, MEETING_ID, undefined, {
      pruneUnmatched: true,
      retire: [ITEM],
    });
  });
});
