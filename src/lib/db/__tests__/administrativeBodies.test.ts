/**
 * Confirming a body's decision conventions is the write that turns a profile
 * into a human statement: derivation stops flagging the body only because
 * provenance says a person said so, so the stamp is what this asserts.
 */
const mockFindUniqueOrThrow = jest.fn();
const mockUpdate = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
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
            count: (...a: unknown[]) => mockCount(...a),
        },
    },
}));
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a),
    getCurrentUser: () => mockGetCurrentUser(),
}));

import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import {
    countBodyDirectory,
    createAdministrativeBody,
    editAdministrativeBody,
    editAdministrativeBodyContacts,
    getAdministrativeBodiesWithPublicMeetings,
    getBodyDirectory,
    getPublicAdministrativeBodiesForCity,
} from '@/lib/db/administrativeBodies';
import { publicAdministrativeBodySelect } from '@/lib/db/types';
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';
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
        expect(Object.keys(publicAdministrativeBodySelect).sort()).toEqual(['cityId', 'id', 'name', 'name_en', 'type']);
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

    it('the bodies with a public meeting carry whether they send updates, which the signup reads (#829)', async () => {
        await getAdministrativeBodiesWithPublicMeetings('zografou');
        expect(mockFindMany.mock.calls[0][0].select).toEqual({ ...publicAdministrativeBodySelect, notificationBehavior: true });
        await getPublicAdministrativeBodiesForCity('zografou');
        expect(mockFindMany.mock.calls[1][0].select).toEqual(publicAdministrativeBodySelect);
    });
});

/**
 * The directory of a body type (#829) is a public page: it lists the bodies
 * of the type that released a meeting, in the public cities of the realm,
 * public by status or through a secondary body.
 */
describe('the directory of a body type', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindMany.mockResolvedValue([]);
        mockCount.mockResolvedValue(0);
    });

    it('lists released bodies of the type in the public cities of the realm, by city then by name', async () => {
        await getBodyDirectory('greece', 'youthCouncil');
        expect(mockFindMany).toHaveBeenCalledTimes(1);
        const query = mockFindMany.mock.calls[0][0];
        expect(query.where).toEqual({
            type: 'youthCouncil',
            meetings: { some: { released: true } },
            city: { realm: 'greece', ...PUBLIC_CITY_WHERE },
        });
        expect(query.orderBy).toEqual([{ city: { name: 'asc' } }, { name: 'asc' }]);
        // The public fields, the city, the counts and the last released meeting: nothing of the settings.
        expect(Object.keys(query.select).sort()).toEqual(['_count', 'city', 'cityId', 'id', 'meetings', 'name', 'name_en', 'place', 'type']);
        expect(query.select.meetings).toMatchObject({ where: { released: true }, orderBy: { dateTime: 'desc' }, take: 1 });
    });

    it('counts the same rows for the sitemap', async () => {
        mockCount.mockResolvedValue(2);
        await expect(countBodyDirectory('greece', 'youthCouncil')).resolves.toBe(2);
        expect(mockCount.mock.calls[0][0].where).toMatchObject({ type: 'youthCouncil', meetings: { some: { released: true } }, city: { realm: 'greece' } });
    });
});

/**
 * The updates switch of the contacts write (#829) belongs to a secondary
 * body. A primary body's notification behaviour stays with the city admin.
 */
describe('the contacts write and the updates switch', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWithUserAuthorizedToEdit.mockResolvedValue(true);
        mockUpdate.mockImplementation(async (args: { data: unknown }) => ({ id: 'body', ...(args.data as object) }));
    });

    it('writes the switch of a secondary body, gated on the body', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({ cityId: 'chania', type: 'youthCouncil' });
        await editAdministrativeBodyContacts('youth', { contactEmails: ['a@example.org'], notificationBehavior: 'NOTIFICATIONS_AUTO' });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'chania', administrativeBodyId: 'youth' });
        expect(mockUpdate.mock.calls[0][0].data).toEqual({ youtubeChannelUrl: undefined, contactEmails: ['a@example.org'], notificationBehavior: 'NOTIFICATIONS_AUTO' });
    });

    it('refuses the switch on a primary body, and leaves the contacts write of that body as it was', async () => {
        mockFindUniqueOrThrow.mockResolvedValue({ cityId: 'chania', type: 'committee' });
        await expect(editAdministrativeBodyContacts('committee', { notificationBehavior: 'NOTIFICATIONS_AUTO' })).rejects.toMatchObject({ statusCode: 400 });
        expect(mockUpdate).not.toHaveBeenCalled();
        await editAdministrativeBodyContacts('committee', { contactEmails: [] });
        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
});
