/** @jest-environment node */

/**
 * Tests for handleProcessAgendaResult subject-handling on empty / malformed
 * success payloads (issue #102).
 *
 * Some agendas (e.g. λογοδοσία / accountability sessions) genuinely have no
 * extractable subjects. The backend reports success with `{ subjects: [] }`,
 * which must be treated as a valid success — existing subjects are replaced
 * (with nothing). A malformed success payload that omits `subjects` entirely
 * must NOT throw (which would flip the succeeded task to failed) and must NOT
 * delete existing subjects.
 */

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';
const TASK_ID = 'task-1';

const mockHighlightDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockSubjectDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
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

jest.mock('../processAgendaInternal', () => ({
  requestProcessAgendaInternal: jest.fn(),
}));

import { handleProcessAgendaResult } from '../processAgenda';
import { ProcessAgendaResult } from '../../apiTypes';

describe('handleProcessAgendaResult — empty / malformed subjects (issue #102)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats { subjects: [] } as a valid success: replaces subjects, does not throw', async () => {
    await expect(
      handleProcessAgendaResult(TASK_ID, { subjects: [] } as ProcessAgendaResult)
    ).resolves.toBeUndefined();

    // Empty agenda is authoritative → existing subjects are deleted/replaced
    expect(mockSubjectDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockHighlightDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockSaveSubjectsForMeeting).toHaveBeenCalledWith([], CITY_ID, MEETING_ID);
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
