/** @jest-environment node */

import { LifecycleRuleError } from '../../meetingLifecycleRules';
import type { AgendaMeetingRecord } from '../../apiTypes';

jest.mock('server-only', () => ({}));

const mockUpdate = jest.fn();
jest.mock('@/lib/db/meetingLifecycle', () => ({
    updateMeetingRecord: (...args: unknown[]) => mockUpdate(...args),
}));

// The row as the write reads it; the callback's copy may be stale.
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { councilMeeting: {
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        findMany: (...args: unknown[]) => mockFindMany(...args),
    } },
}));

const mockSync = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/google-calendar', () => ({
    syncMeetingToCalendar: (...args: unknown[]) => mockSync(...args),
}));

import { applyAgendaMeetingRecord } from '../applyAgendaMeetingRecord';

const meeting = {
    id: 'oct8_2026',
    cityId: 'chalandri',
    name: null,
    name_en: null,
    kind: null,
    urgent: false,
    sessionNumber: null,
    format: 'inPerson' as const,
    continuationOfId: null,
    dateTime: new Date('2026-10-08T10:00:00Z'),
    administrativeBody: { name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee' },
    city: { name_en: 'Chalandri', timezone: 'Europe/Athens' },
};

const read: AgendaMeetingRecord = {
    kind: 'accountability',
    kindEvidence: 'Ειδική Συνεδρίαση Λογοδοσίας',
    urgent: false,
    urgentEvidence: null,
    sessionNumber: 4,
    sessionNumberEvidence: '4η Ειδική Συνεδρίαση Λογοδοσίας',
    format: 'remote',
    formatEvidence: 'με τηλεδιάσκεψη',
};

const stored = (overrides = {}) => ({
    name: null,
    kind: null, urgent: false, sessionNumber: null, format: 'inPerson', continuationOfId: null, postponedFromId: null,
    agendaUrl: 'https://example.org/agenda.pdf', dateTime: new Date('2026-02-25T17:00:00Z'), administrativeBodyId: 'body-1', scheduleStatus: 'scheduled',
    administrativeBody: { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'City Council' }, ...overrides,
});

const sibling = (overrides = {}) => ({
    id: 'feb25_2_2026', agendaUrl: null, dateTime: new Date('2026-02-25T18:00:00Z'),
    scheduleStatus: 'scheduled', continuationOfId: null, postponedFromId: null, ...overrides,
});

describe('applyAgendaMeetingRecord', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindUnique.mockResolvedValue(stored());
        mockFindMany.mockResolvedValue([]);
    });

    it('writes what the record lacks through the write path, and reports the format it holds', async () => {
        mockUpdate.mockResolvedValue({});

        const { written, problems } = await applyAgendaMeetingRecord(meeting, read, [], []);

        expect(mockUpdate).toHaveBeenCalledWith('chalandri', 'oct8_2026', { kind: 'accountability', sessionNumber: 4 });
        expect(written).toEqual({ kind: 'accountability', sessionNumber: 4 });
        expect(problems).toEqual([
            'format: recorded inPerson, invitation says remote («με τηλεδιάσκεψη»)',
        ]);
    });

    it('compares a value an admin set while the subjects were saved, instead of overwriting it', async () => {
        mockFindUnique.mockResolvedValue(stored({ kind: 'ordinary' }));
        mockUpdate.mockResolvedValue({});

        const { written, problems } = await applyAgendaMeetingRecord(meeting, { ...read, format: null }, [], []);

        expect(written).toEqual({ sessionNumber: 4 });
        expect(problems[0]).toContain('kind: recorded ordinary, invitation says accountability');
    });

    it('reports a write the rules refuse and writes nothing', async () => {
        // The body changed to a committee between the read and the write.
        mockUpdate.mockRejectedValue(new LifecycleRuleError('councilOnlyKind', 'council only'));

        const { written, problems } = await applyAgendaMeetingRecord(meeting, { ...read, format: null }, [], []);

        expect(written).toEqual({});
        expect(mockUpdate).toHaveBeenCalledTimes(1);
        expect(problems.join(' ')).toContain('councilOnlyKind');
    });

    it('lets another failure reach the caller, which keeps the task', async () => {
        mockUpdate.mockRejectedValue(new Error('connection reset'));
        await expect(applyAgendaMeetingRecord(meeting, read, [], [])).rejects.toThrow('connection reset');
    });

    const twoMeetings = [
        { ...read, municipality: null, date: null, bodyName: 'Δημοτικό Συμβούλιο', ofThisBody: true, time: '19:00', subjectCount: 0, isThisMeeting: true },
        { ...read, kind: 'ordinary' as const, sessionNumber: 18, municipality: null, date: null, bodyName: 'Δημοτικό Συμβούλιο', ofThisBody: true, time: '20:00', subjectCount: 12, isThisMeeting: false },
    ];

    it('keeps a record of two meetings without a kind or number when no other record holds the other, writes no name, and says so', async () => {
        mockUpdate.mockResolvedValue({});

        const { written, problems } = await applyAgendaMeetingRecord(meeting, { ...read, format: null }, twoMeetings, []);

        // The λογοδοσία at 19:00 is this meeting by its time, but the record also holds the regular meeting at 20:00.
        expect(written).toEqual({});
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(problems[0]).toMatch(/^the agenda holds 2 meetings, and all 12 subjects were saved on this one; no other record holds the others/);
    });

    it('does not count a record of the same meeting as the holder of the other one', async () => {
        // A postponed meeting and its new meeting, or a later part, hold the same meeting (#856 review).
        mockFindUnique.mockResolvedValue(stored({ postponedFromId: 'feb20_2026' }));
        mockFindMany.mockResolvedValue([sibling({ id: 'feb20_2026', scheduleStatus: 'postponed' })]);
        mockUpdate.mockResolvedValue({});

        const { written, problems } = await applyAgendaMeetingRecord(meeting, { ...read, format: null }, twoMeetings, []);

        expect(written).toEqual({});
        expect(problems[0]).toContain('kept as a combined meeting');
    });

    it('fills the record from its own meeting when another record holds the other one', async () => {
        mockFindMany.mockResolvedValue([sibling({ id: 'feb25_2_2026' })]);
        mockUpdate.mockResolvedValue({});

        const { written, problems } = await applyAgendaMeetingRecord(meeting, { ...read, format: null }, twoMeetings, []);

        expect(written).toEqual({ kind: 'accountability', sessionNumber: 4 });
        expect(problems[0]).toContain('another record of the same body holds another of them');
    });

    it('reports a kind, an urgency or a number that a combined record already holds', () => {
        mockFindUnique.mockResolvedValue(stored({ kind: 'accountability' }));
        return applyAgendaMeetingRecord(meeting, read, twoMeetings, []).then(({ written, problems }) => {
            expect(written).toEqual({});
            expect(problems).toContain("this record holds one meeting's kind accountability, though it holds several meetings");
        });
    });

    it('keeps a stored name that says more than the derived title: the kind waits for a person', async () => {
        // Σπάρτη: the committee sitting as the manager of bequests.
        mockFindUnique.mockResolvedValue(stored({ name: 'Δημοτική - Διαχειριστική Επιτροπή 10/02/26', administrativeBody: { type: 'committee', name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee' } }));
        mockUpdate.mockResolvedValue({});

        const { written, problems } = await applyAgendaMeetingRecord(meeting, { ...read, kind: 'ordinary', format: null }, [], []);

        expect(written).toEqual({ sessionNumber: 4 });
        expect(problems[0]).toMatch(/^kind ordinary not written: the stored name «Δημοτική - Διαχειριστική Επιτροπή 10\/02\/26» says more/);
    });

    it('fills the kind of a meeting whose stored name says only the body and the date', async () => {
        mockFindUnique.mockResolvedValue(stored({ name: 'Δημοτικό Συμβούλιο 25/02/26' }));
        mockUpdate.mockResolvedValue({});
        expect((await applyAgendaMeetingRecord(meeting, { ...read, format: null }, [], [])).written).toEqual({ kind: 'accountability', sessionNumber: 4 });
    });

    it('syncs the calendar when the derived title changes, and only then', async () => {
        mockUpdate.mockResolvedValue({});
        await applyAgendaMeetingRecord(meeting, { ...read, format: null }, [], []);
        expect(mockSync).toHaveBeenCalledWith('chalandri', 'oct8_2026');

        mockSync.mockClear();
        mockFindUnique.mockResolvedValue(stored({ kind: 'accountability', sessionNumber: 4, format: null }));
        await applyAgendaMeetingRecord(meeting, read, [], []);
        expect(mockUpdate).toHaveBeenLastCalledWith('chalandri', 'oct8_2026', { format: 'remote' });
        expect(mockSync).not.toHaveBeenCalled();
    });

    it("says that the agenda's other meetings are other bodies', not another record's", async () => {
        mockUpdate.mockResolvedValue({});
        const withBequest = [twoMeetings[0], { ...twoMeetings[1], bodyName: 'Διαχειριστική Επιτροπή Κληροδοτήματος', ofThisBody: false }];
        const { problems } = await applyAgendaMeetingRecord(meeting, { ...read, format: null }, withBequest, []);
        expect(problems[0]).toContain("the others are other bodies' meetings");
    });
});
