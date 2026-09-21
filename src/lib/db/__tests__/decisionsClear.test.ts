/**
 * "Reset extractions" and "Clear extracted data" are named for the facts they
 * remove, and the facts grew: a reading now writes eight columns on Decision and
 * a row per stated arrival or departure. What these two clear is therefore what
 * a superadmin gets back — a meeting that still counts as read, still prints its
 * arrivals block and rebuilds its rows on the next Re-derive is the bug.
 */
const mockTransaction = jest.fn();
const mockDecisionUpdateMany = jest.fn();
const mockSubjectAttendanceDeleteMany = jest.fn();
const mockSubjectVoteDeleteMany = jest.fn();
const mockMeetingAttendanceDeleteMany = jest.fn();
const mockAttendanceEventDeleteMany = jest.fn();
const mockSubjectFindMany = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        $transaction: (...a: unknown[]) => mockTransaction(...a),
        decision: { updateMany: (...a: unknown[]) => mockDecisionUpdateMany(...a) },
        subjectAttendance: { deleteMany: (...a: unknown[]) => mockSubjectAttendanceDeleteMany(...a) },
        subjectVote: { deleteMany: (...a: unknown[]) => mockSubjectVoteDeleteMany(...a) },
        meetingAttendance: { deleteMany: (...a: unknown[]) => mockMeetingAttendanceDeleteMany(...a) },
        attendanceEvent: { deleteMany: (...a: unknown[]) => mockAttendanceEventDeleteMany(...a) },
        subject: { findMany: (...a: unknown[]) => mockSubjectFindMany(...a) },
    },
}));

import { clearExtractedDataForMeeting, resetExtractionForSubject } from '@/lib/db/decisions';
import { Prisma } from '@prisma/client';

const FACT_COLUMNS = ['voteResultPhrase', 'mayorPresent', 'declaredItemNumber', 'declaredOutOfAgenda', 'incomplete', 'unmatchedNames', 'extractorVersion', 'extraction'];

beforeEach(() => {
    jest.clearAllMocks();
    // Two call shapes reach $transaction: an array of prepared promises, and a
    // callback given a transaction client. Running either is what records the
    // calls, and updateMany's result is read for clearedCount.
    const tx = {
        decision: { updateMany: (...a: unknown[]) => mockDecisionUpdateMany(...a) },
        subjectAttendance: { deleteMany: (...a: unknown[]) => mockSubjectAttendanceDeleteMany(...a) },
        subjectVote: { deleteMany: (...a: unknown[]) => mockSubjectVoteDeleteMany(...a) },
        meetingAttendance: { deleteMany: (...a: unknown[]) => mockMeetingAttendanceDeleteMany(...a) },
        attendanceEvent: { deleteMany: (...a: unknown[]) => mockAttendanceEventDeleteMany(...a) },
        subject: { findMany: (...a: unknown[]) => mockSubjectFindMany(...a) },
    };
    mockTransaction.mockImplementation(async (arg: unknown) =>
        typeof arg === 'function'
            ? (arg as (t: typeof tx) => unknown)(tx)
            : Promise.all(arg as Promise<unknown>[]));
    mockDecisionUpdateMany.mockResolvedValue({ count: 3 });
    mockSubjectAttendanceDeleteMany.mockResolvedValue({ count: 0 });
    mockSubjectVoteDeleteMany.mockResolvedValue({ count: 0 });
    mockMeetingAttendanceDeleteMany.mockResolvedValue({ count: 0 });
    mockAttendanceEventDeleteMany.mockResolvedValue({ count: 0 });
});

describe('resetExtractionForSubject', () => {
    it('clears every column a reading wrote, not just the text', async () => {
        await resetExtractionForSubject('subject-1');
        const data = mockDecisionUpdateMany.mock.calls[0][0].data;
        expect(Object.keys(data)).toEqual(expect.arrayContaining(['excerpt', 'references', ...FACT_COLUMNS]));
        expect(data.extraction).toBe(Prisma.DbNull);
        expect(data.incomplete).toBe(false);
        expect(data.unmatchedNames).toEqual([]);
    });
});

describe('clearExtractedDataForMeeting', () => {
    it('clears the fact columns and the meeting\'s stated attendance events', async () => {
        mockSubjectFindMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

        await expect(clearExtractedDataForMeeting('chalandri', 'meeting-1')).resolves.toEqual({ clearedCount: 3 });

        expect(mockDecisionUpdateMany.mock.calls[0][0].data.extraction).toBe(Prisma.DbNull);
        expect(mockAttendanceEventDeleteMany).toHaveBeenCalledWith({
            where: { cityId: 'chalandri', councilMeetingId: 'meeting-1', source: 'decision' },
        });
        expect(mockMeetingAttendanceDeleteMany).toHaveBeenCalled();
    });

    it('does nothing for a meeting with no subjects', async () => {
        mockSubjectFindMany.mockResolvedValue([]);
        await expect(clearExtractedDataForMeeting('chalandri', 'meeting-1')).resolves.toEqual({ clearedCount: 0 });
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});
