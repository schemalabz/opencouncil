/**
 * Confirming a body's decision conventions is the write that turns a profile
 * into a human statement: derivation stops flagging the body only because
 * provenance says a person said so, so the stamp is what this asserts.
 */
const mockFindUniqueOrThrow = jest.fn();
const mockUpdate = jest.fn();
const mockMeetingFindFirst = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        administrativeBody: {
            findUniqueOrThrow: (...a: unknown[]) => mockFindUniqueOrThrow(...a),
            findUnique: (...a: unknown[]) => mockFindUniqueOrThrow(...a),
            update: (...a: unknown[]) => mockUpdate(...a),
            create: (...a: unknown[]) => mockUpdate(...a),
        },
        councilMeeting: { findFirst: (...a: unknown[]) => mockMeetingFindFirst(...a) },
    },
}));
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a),
    getCurrentUser: () => mockGetCurrentUser(),
}));

import { confirmDecisionConventions, getMostRecentMeetingIdForBody, storeProfiledDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { createAdministrativeBody, editAdministrativeBody } from '@/lib/db/administrativeBodies';
import type { DecisionConventions } from '@/lib/decisionConventions';

const PROFILED: DecisionConventions = {
    version: 1,
    rollCallLayout: 'present_and_absent',
    presentListMeaning: 'opening',
    attendanceChangeAnchors: ['agenda_item'],
    statesPerDecisionAttendance: false,
    statesPerVoteAbsence: false,
    usesSubstitutes: false,
    namedVoters: 'dissenters_only',
    mayorStatedSeparately: true,
    provenance: { source: 'profile', profiledAt: '2026-09-13', documentsSampled: 40 },
};

describe('confirmDecisionConventions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindUniqueOrThrow.mockResolvedValue({ cityId: 'zografou' });
        mockUpdate.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'body-1', ...(data as object) }));
        mockWithUserAuthorizedToEdit.mockResolvedValue(true);
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    });

    it('stamps the confirmation onto the conventions it writes', async () => {
        await confirmDecisionConventions('body-1', PROFILED);

        expect(mockUpdate).toHaveBeenCalledTimes(1);
        const written = mockUpdate.mock.calls[0][0].data.decisionConventions as DecisionConventions;
        expect(written.provenance.source).toBe('manual');
        // The session's user, never an argument: the caller cannot name another author.
        expect(written.provenance.confirmedBy).toBe('user-1');
        expect(Date.parse(written.provenance.confirmedAt!)).not.toBeNaN();
        // The profile's own trail survives; the person's edits are what is stored.
        expect(written.provenance.profiledAt).toBe('2026-09-13');
        expect(written.rollCallLayout).toBe('present_and_absent');
    });

    it('writes the edited values, not the ones the profile held', async () => {
        const edited: DecisionConventions = { ...PROFILED, presentListMeaning: 'cumulative', statesPerDecisionAttendance: true, notes: 'ΑΠΟΧΩΡΗΣΑΝΤΕΣ at the end' };
        await confirmDecisionConventions('body-1', edited);

        const written = mockUpdate.mock.calls[0][0].data.decisionConventions as DecisionConventions;
        expect(written.presentListMeaning).toBe('cumulative');
        expect(written.statesPerDecisionAttendance).toBe(true);
        expect(written.notes).toBe('ΑΠΟΧΩΡΗΣΑΝΤΕΣ at the end');
    });

    it('authorizes against the body\'s own city before writing', async () => {
        await confirmDecisionConventions('body-1', PROFILED);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou' });
    });

    it('does not write when the caller may not edit the city', async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));
        await expect(confirmDecisionConventions('body-1', PROFILED)).rejects.toThrow('Not authorized');
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('refuses a record the schema does not accept, before it reaches the column', async () => {
        await expect(confirmDecisionConventions('body-1', { version: 1 })).rejects.toThrow();
        await expect(confirmDecisionConventions('body-1', { ...PROFILED, namedVoters: 'everyone' })).rejects.toThrow();
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

/**
 * The profiling task's write. It is the only write here that runs without a
 * session (the task callback carries none), so what it refuses is the guard:
 * a row a person confirmed, and anything that is not a profile record.
 */
describe('storeProfiledDecisionConventions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdate.mockResolvedValue({ id: 'body-1' });
    });

    it('writes the profile onto a body nobody has confirmed', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({ decisionConventions: null });

        await expect(storeProfiledDecisionConventions('body-1', PROFILED)).resolves.toBe(true);
        expect(mockUpdate.mock.calls[0][0].data.decisionConventions).toEqual(PROFILED);
    });

    it('replaces an older profile with the new one', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({
            decisionConventions: { ...PROFILED, provenance: { source: 'profile', profiledAt: '2026-01-01', documentsSampled: 10 } },
        });

        await expect(storeProfiledDecisionConventions('body-1', PROFILED)).resolves.toBe(true);
        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    /**
     * The profiler cannot see either of these: its presentListMeaning domain holds
     * no `per_decision` and it emits no `listOmitsSecretary`. A plain replace turned
     * argos/Δημοτικό Συμβούλιο's `per_decision` into `cumulative` on every press of
     * Profile, and the branch it gates stopped firing.
     */
    it('keeps what only a person could have set, and takes the rest from the profile', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({
            decisionConventions: {
                ...PROFILED,
                presentListMeaning: 'per_decision',
                listOmitsSecretary: true,
                rollCallLayout: 'present_only',
            },
        });

        await expect(storeProfiledDecisionConventions('body-1', PROFILED)).resolves.toBe(true);
        const written = mockUpdate.mock.calls[0][0].data.decisionConventions as DecisionConventions;
        expect(written.presentListMeaning).toBe('per_decision');
        expect(written.listOmitsSecretary).toBe(true);
        // Everything the profile can observe is the profile's.
        expect(written.rollCallLayout).toBe('present_and_absent');
        expect(written.provenance).toEqual(PROFILED.provenance);
    });

    it('keeps a stored note, and fills an empty one from the profile', async () => {
        // argithea/Δημοτική Επιτροπή: 24 of the 31 imported rows carry a note a person wrote.
        const note = 'Present and absent lists at the top; departures only in prose. Must be hunted on Diavgeia.';
        const store = async (stored: object, profiled: DecisionConventions) => {
            mockUpdate.mockClear();
            mockFindUniqueOrThrow.mockResolvedValue({ decisionConventions: stored });
            await storeProfiledDecisionConventions('body-1', profiled);
            return (mockUpdate.mock.calls[0][0].data.decisionConventions as DecisionConventions).notes;
        };
        expect(await store({ ...PROFILED, notes: note }, PROFILED)).toBe(note);
        expect(await store({ ...PROFILED, notes: note }, { ...PROFILED, notes: 'roll-call-meaning-contested' })).toBe(note);
        expect(await store(PROFILED, { ...PROFILED, notes: 'roll-call-meaning-contested' })).toBe('roll-call-meaning-contested');
    });

    it('takes the profile whole where the stored row states nothing human-only', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({ decisionConventions: { ...PROFILED, presentListMeaning: 'cumulative' } });

        await storeProfiledDecisionConventions('body-1', PROFILED);
        expect(mockUpdate.mock.calls[0][0].data.decisionConventions).toEqual(PROFILED);
    });

    it('leaves a confirmed row alone', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({
            decisionConventions: { ...PROFILED, provenance: { source: 'manual', confirmedBy: 'user-1' } },
        });

        await expect(storeProfiledDecisionConventions('body-1', PROFILED)).resolves.toBe(false);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('refuses anything that is not a profiled conventions record', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({ decisionConventions: null });

        await expect(storeProfiledDecisionConventions('body-1', { ...PROFILED, provenance: { source: 'manual' } }))
            .rejects.toThrow('profiled conventions record');
        await expect(storeProfiledDecisionConventions('body-1', { version: 2 } as unknown as DecisionConventions))
            .rejects.toThrow('profiled conventions record');
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe('getMostRecentMeetingIdForBody', () => {
    it('is the latest meeting of the body, or null when it has none', async () => {
        mockMeetingFindFirst.mockResolvedValue({ id: 'meeting-9' });
        await expect(getMostRecentMeetingIdForBody('body-1')).resolves.toBe('meeting-9');
        expect(mockMeetingFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { administrativeBodyId: 'body-1' },
            orderBy: { dateTime: 'desc' },
        }));

        mockMeetingFindFirst.mockResolvedValue(null);
        await expect(getMostRecentMeetingIdForBody('body-1')).resolves.toBeNull();
    });
});

/**
 * The two writers are Server Actions: a client can call them with any payload,
 * whatever their parameter types say. The conventions column has its own
 * writers, which parse the record and stamp its author, so these two must not
 * write it at all.
 */
describe('the body writers never write the conventions column', () => {
    const smuggled = { provenance: { source: 'manual', confirmedBy: 'someone-else' } };
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindUniqueOrThrow.mockResolvedValue({ cityId: 'zografou' });
        mockUpdate.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'body-1', ...(data as object) }));
        mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    });
    it('edit drops a decisionConventions it is sent', async () => {
        await editAdministrativeBody('body-1', { name: 'Δημοτικό Συμβούλιο', decisionConventions: smuggled } as unknown as Parameters<typeof editAdministrativeBody>[1]);
        expect(mockUpdate.mock.calls[0][0].data).toEqual({ name: 'Δημοτικό Συμβούλιο' });
    });
    it('create drops a decisionConventions it is sent', async () => {
        await createAdministrativeBody({ name: 'Δημοτικό Συμβούλιο', cityId: 'zografou', decisionConventions: smuggled } as unknown as Parameters<typeof createAdministrativeBody>[0]);
        expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty('decisionConventions');
    });

    it('writes only the fields it names, whatever the caller sends', async () => {
        const sent = { name: 'Νέο όνομα', cityId: 'other-city', decisionConventions: { x: 1 } } as unknown as Parameters<typeof editAdministrativeBody>[1];
        await editAdministrativeBody('b1', sent);
        const data = (mockUpdate as jest.Mock).mock.calls.at(-1)[0].data;
        expect(data).toEqual({ name: 'Νέο όνομα' });
    });
});
