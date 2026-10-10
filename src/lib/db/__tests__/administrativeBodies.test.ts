/**
 * Confirming a body's decision conventions is the write that turns a profile
 * into a human statement: derivation stops flagging the body only because
 * provenance says a person said so, so the stamp is what this asserts.
 */
const mockFindUniqueOrThrow = jest.fn();
const mockUpdate = jest.fn();
const mockFindMany = jest.fn();
const mockMeetingFindUnique = jest.fn();
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
            findMany: (...a: unknown[]) => mockFindMany(...a),
        },
        councilMeeting: {
            findUnique: (...a: unknown[]) => mockMeetingFindUnique(...a),
        },
    },
}));
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a),
    getCurrentUser: () => mockGetCurrentUser(),
}));

import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import {
    createAdministrativeBody,
    editAdministrativeBody,
    getAdministrativeBodiesForCity,
    getAdministrativeBodiesWithPublicMeetings,
    getMeetingBodySettings,
    getPublicAdministrativeBodiesForCity,
} from '@/lib/db/administrativeBodies';
import { publicAdministrativeBodySelect } from '@/lib/db/types';
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
 * The two writers take the payload that the API route passes on, whatever
 * their parameter types say. The conventions column has its own
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

/**
 * The public reads reach a browser: the bodies route for a reader who cannot
 * edit the city, the search filters' Server Action, the meetings tab. The key
 * set of the select is the whole privacy surface, so it is pinned here.
 */
describe('the public body reads select only the public fields', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindMany.mockResolvedValue([]);
    });

    it('the public select names the identity of a body and nothing of its settings', () => {
        expect(Object.keys(publicAdministrativeBodySelect).sort()).toEqual(['cityId', 'id', 'name', 'name_en', 'place', 'type', 'youtubeChannelUrl']);
    });

    it.each([
        ['getPublicAdministrativeBodiesForCity', getPublicAdministrativeBodiesForCity],
        ['getAdministrativeBodiesWithPublicMeetings', getAdministrativeBodiesWithPublicMeetings],
    ])('%s queries with the public select', async (_name, read) => {
        await read('zografou');
        expect(mockFindMany).toHaveBeenCalledTimes(1);
        expect(mockFindMany.mock.calls[0][0]).toMatchObject({
            where: { cityId: 'zografou' },
            select: publicAdministrativeBodySelect,
        });
    });
});

/**
 * The meeting's admin page and decisions page read the settings of the body
 * apart from the public meeting. The read is the gate: it refuses a session
 * that does not edit the city before it touches the row.
 */
describe('getMeetingBodySettings', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reads nothing for a session that does not edit the city', async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Unauthorized'));

        await expect(getMeetingBodySettings('zografou', 'm1')).rejects.toThrow('Unauthorized');
        expect(mockMeetingFindUnique).not.toHaveBeenCalled();
    });

    it("gives an editor the settings of the meeting's body", async () => {
        mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
        const settings = { id: 'b1', notificationBehavior: 'NOTIFICATIONS_AUTO', diavgeiaUnitIds: ['81689'], decisionConventions: null };
        mockMeetingFindUnique.mockResolvedValue({ administrativeBody: settings });

        await expect(getMeetingBodySettings('zografou', 'm1')).resolves.toEqual(settings);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou' });
        expect(mockMeetingFindUnique.mock.calls[0][0]).toMatchObject({ where: { cityId_id: { cityId: 'zografou', id: 'm1' } } });
    });
});

/** The full rows carry the settings, so the reader itself is the gate. */
describe('getAdministrativeBodiesForCity', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reads nothing for a session that does not edit the city', async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Unauthorized'));

        await expect(getAdministrativeBodiesForCity('zografou')).rejects.toThrow('Unauthorized');
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('gives an editor the full rows', async () => {
        mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
        mockFindMany.mockResolvedValue([{ id: 'b1', contactEmails: ['a@b.gr'] }]);

        await expect(getAdministrativeBodiesForCity('zografou')).resolves.toEqual([{ id: 'b1', contactEmails: ['a@b.gr'] }]);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou' });
    });
});
