/** @jest-environment node */

const mockCityFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockHighlightFindUnique = jest.fn();
const mockHighlightUpsert = jest.fn();
const mockMeetingFindUnique = jest.fn();
const mockUtteranceFindMany = jest.fn();
const mockSubjectFindUnique = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        city: { findUnique: (...args: unknown[]) => mockCityFindUnique(...args) },
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        councilMeeting: { findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args) },
        utterance: { findMany: (...args: unknown[]) => mockUtteranceFindMany(...args) },
        subject: { findUnique: (...args: unknown[]) => mockSubjectFindUnique(...args) },
        highlight: {
            findUnique: (...args: unknown[]) => mockHighlightFindUnique(...args),
            upsert: (...args: unknown[]) => mockHighlightUpsert(...args),
        },
    },
}));

import {
    upsertHighlightCore, canUserEditCity, canUserEditMeeting, canActorManageHighlight, getUserCityRights,
} from '../highlights-core';
import { ForbiddenError, NotFoundError, BadRequestError } from '../../api/errors';

const DATA = {
    name: 'Test highlight',
    meetingId: 'm1',
    cityId: 'athens',
    utteranceIds: ['utt1', 'utt2'],
};

const USER = 'u1';
const OTHER_USER = 'u2';

function setCityPermission(permission: 'EVERYONE' | 'ADMINS_ONLY') {
    mockCityFindUnique.mockResolvedValue({ highlightCreationPermission: permission });
}

type Administers = { cityId: string | null; administrativeBodyId?: string; administrativeBody?: { cityId: string } };

function setUser(user: { isSuperAdmin?: boolean; administers?: Administers[] } | null) {
    mockUserFindUnique.mockResolvedValue(
        user ? { isSuperAdmin: user.isSuperAdmin ?? false, administers: user.administers ?? [] } : null
    );
}

// An admin of one body of a city, and of nothing else.
const bodyAdminOf = (bodyId: string, cityId: string): Administers =>
    ({ cityId: null, administrativeBodyId: bodyId, administrativeBody: { cityId } });

function setMeetingBody(administrativeBodyId: string | null) {
    mockMeetingFindUnique.mockResolvedValue({ administrativeBodyId });
}

// The utterances of DATA, in DATA's meeting.
function setUtterancesIn(cityId: string, meetingId: string, ids: string[] = DATA.utteranceIds) {
    mockUtteranceFindMany.mockResolvedValue(ids.map(id => ({ id, speakerSegment: { cityId, meetingId } })));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockMeetingFindUnique.mockResolvedValue(null);
    setUtterancesIn(DATA.cityId, DATA.meetingId);
    mockHighlightUpsert.mockImplementation((args: { create: unknown }) => ({
        id: 'h1',
        highlightedUtterances: [],
        ...(args as { create: Record<string, unknown> }).create,
    }));
});

describe('canUserEditCity', () => {
    it('is true for superadmins and city admins, false otherwise', async () => {
        setUser({ isSuperAdmin: true });
        expect(await canUserEditCity('u1', 'athens')).toBe(true);

        setUser({ administers: [{ cityId: 'athens' }] });
        expect(await canUserEditCity('u1', 'athens')).toBe(true);

        setUser({ administers: [{ cityId: 'argos' }] });
        expect(await canUserEditCity('u1', 'athens')).toBe(false);

        setUser(null);
        expect(await canUserEditCity('u1', 'athens')).toBe(false);
    });
});

describe('getUserCityRights', () => {
    it('maps each administered body to its city, and ignores party and person rights', async () => {
        setUser({ administers: [{ cityId: 'argos' }, { cityId: null }, bodyAdminOf('council', 'athens')] });
        expect(await getUserCityRights('u1')).toEqual({
            all: false, cityIds: new Set(['argos']), bodies: new Map([['council', 'athens']]),
        });
    });

    it('gives a superadmin everything and lists nothing', async () => {
        setUser({ isSuperAdmin: true, administers: [bodyAdminOf('council', 'athens')] });
        expect(await getUserCityRights('u1')).toEqual({ all: true, cityIds: new Set(), bodies: new Map() });
    });
});

describe('canUserEditMeeting', () => {
    it('is true for superadmins and city admins without reading the meeting', async () => {
        setUser({ isSuperAdmin: true });
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(true);
        setUser({ administers: [{ cityId: 'athens' }] });
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(true);
        expect(mockMeetingFindUnique).not.toHaveBeenCalled();
    });

    it('is true for the admin of the body that holds the meeting', async () => {
        setUser({ administers: [bodyAdminOf('council', 'athens')] });
        setMeetingBody('council');
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(true);
        expect(mockMeetingFindUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { cityId_id: { cityId: 'athens', id: 'm1' } },
        }));

        setMeetingBody('committee');
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(false);
        setMeetingBody(null);
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(false);
        mockMeetingFindUnique.mockResolvedValue(null);
        expect(await canUserEditMeeting('u1', 'athens', 'missing')).toBe(false);
    });

    it('is false for a user with no rights, without reading the meeting', async () => {
        setUser({ administers: [{ cityId: 'argos' }] });
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(false);
        setUser(null);
        expect(await canUserEditMeeting('u1', 'athens', 'm1')).toBe(false);
        expect(mockMeetingFindUnique).not.toHaveBeenCalled();
    });
});

describe('canActorManageHighlight', () => {
    const highlight = { cityId: 'athens', meetingId: 'm1', createdById: 'u1' };

    it('allows the owner without a city-permission lookup', async () => {
        expect(await canActorManageHighlight(USER, highlight)).toBe(true);
        expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('allows city editors and rejects unrelated users', async () => {
        setUser({ administers: [{ cityId: 'athens' }] });
        expect(await canActorManageHighlight(OTHER_USER, highlight)).toBe(true);

        setUser({ administers: [] });
        expect(await canActorManageHighlight(OTHER_USER, highlight)).toBe(false);

        // a highlight whose creator was deleted: only editors may manage
        expect(await canActorManageHighlight(USER, { ...highlight, createdById: null })).toBe(false);
    });

    it('allows the admin of the body that holds the meeting', async () => {
        setUser({ administers: [bodyAdminOf('council', 'athens')] });
        setMeetingBody('council');
        expect(await canActorManageHighlight(OTHER_USER, highlight)).toBe(true);
        setMeetingBody('committee');
        expect(await canActorManageHighlight(OTHER_USER, highlight)).toBe(false);
    });
});

describe('upsertHighlightCore authorization', () => {
    it('ADMINS_ONLY: rejects non-admin users', async () => {
        setCityPermission('ADMINS_ONLY');
        setUser({ administers: [] });
        await expect(upsertHighlightCore(USER, DATA)).rejects.toThrow(ForbiddenError);
    });

    it('ADMINS_ONLY: allows city admins', async () => {
        setCityPermission('ADMINS_ONLY');
        setUser({ administers: [{ cityId: 'athens' }] });
        await expect(upsertHighlightCore(USER, DATA)).resolves.toMatchObject({ id: 'h1' });
    });

    it('ADMINS_ONLY: allows the admin of the body that holds the meeting, and no other body admin', async () => {
        setCityPermission('ADMINS_ONLY');
        setUser({ administers: [bodyAdminOf('council', 'athens')] });
        setMeetingBody('council');
        await expect(upsertHighlightCore(USER, DATA)).resolves.toMatchObject({ id: 'h1' });
        setMeetingBody('committee');
        await expect(upsertHighlightCore(USER, DATA)).rejects.toThrow(ForbiddenError);
    });

    it('EVERYONE: allows any user to create', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        await expect(upsertHighlightCore(USER, DATA)).resolves.toMatchObject({ id: 'h1' });
    });

    it('EVERYONE: non-admins cannot edit highlights they do not own', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'athens', meetingId: 'm1', createdById: 'u1' });
        await expect(upsertHighlightCore(OTHER_USER, { ...DATA, id: 'h1' })).rejects.toThrow(ForbiddenError);
    });

    it('EVERYONE: owners can edit their own highlights', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'athens', meetingId: 'm1', createdById: 'u1' });
        await expect(upsertHighlightCore(USER, { ...DATA, id: 'h1' })).resolves.toMatchObject({ id: 'h1' });
    });

    it('rejects edits to highlights of another city', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'argos', meetingId: 'm1', createdById: 'u1' });
        await expect(upsertHighlightCore(USER, { ...DATA, id: 'h1' })).rejects.toThrow(BadRequestError);
    });

    it("rejects an edit that names one meeting and a highlight of another, even for the named meeting's body admin", async () => {
        setCityPermission('ADMINS_ONLY');
        setUser({ administers: [bodyAdminOf('council', 'athens')] });
        setMeetingBody('council');
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'athens', meetingId: 'm2', createdById: 'someone-else' });
        await expect(upsertHighlightCore(USER, { ...DATA, id: 'h1' })).rejects.toThrow(BadRequestError);
    });

    it('404s edits to nonexistent highlights', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightFindUnique.mockResolvedValue(null);
        await expect(upsertHighlightCore(USER, { ...DATA, id: 'missing' })).rejects.toThrow(NotFoundError);
    });

    it('404s unknown cities', async () => {
        mockCityFindUnique.mockResolvedValue(null);
        setUser({ administers: [] });
        await expect(upsertHighlightCore(USER, DATA)).rejects.toThrow(NotFoundError);
    });

    it('attributes a highlight to the user who creates it', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });

        await upsertHighlightCore(USER, DATA);
        expect(mockHighlightUpsert.mock.calls[0][0].create.createdBy).toEqual({ connect: { id: 'u1' } });
    });
});

describe('upsertHighlightCore utterance scope', () => {
    beforeEach(() => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightUpsert.mockResolvedValue({ id: 'h1' });
    });

    it('creates a highlight from utterances of the named meeting', async () => {
        await upsertHighlightCore(USER, DATA);

        expect(mockUtteranceFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: { in: DATA.utteranceIds } },
        }));
        expect(mockHighlightUpsert).toHaveBeenCalled();
    });

    it('refuses an utterance of another meeting', async () => {
        mockUtteranceFindMany.mockResolvedValue([
            { id: 'utt1', speakerSegment: { cityId: 'athens', meetingId: 'm1' } },
            { id: 'utt2', speakerSegment: { cityId: 'athens', meetingId: 'unreleased' } },
        ]);

        await expect(upsertHighlightCore(USER, DATA)).rejects.toThrow(BadRequestError);
        expect(mockHighlightUpsert).not.toHaveBeenCalled();
    });

    it('refuses an utterance of another city, even in a meeting of the same id', async () => {
        mockUtteranceFindMany.mockResolvedValue([
            { id: 'utt1', speakerSegment: { cityId: 'athens', meetingId: 'm1' } },
            { id: 'utt2', speakerSegment: { cityId: 'chania', meetingId: 'm1' } },
        ]);

        await expect(upsertHighlightCore(USER, DATA)).rejects.toThrow('All utterances must belong to the specified meeting');
    });

    it('refuses an unknown utterance id', async () => {
        setUtterancesIn('athens', 'm1', ['utt1']);

        await expect(upsertHighlightCore(USER, DATA)).rejects.toThrow('Unknown utterance id');
    });
});

describe('upsertHighlightCore subject scope', () => {
    beforeEach(() => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightUpsert.mockResolvedValue({ id: 'h1' });
    });

    it('links a subject of the named meeting', async () => {
        mockSubjectFindUnique.mockResolvedValue({ cityId: 'athens', councilMeetingId: 'm1' });

        await upsertHighlightCore(USER, { ...DATA, subjectId: 's1' });

        expect(mockHighlightUpsert).toHaveBeenCalled();
    });

    it('refuses a subject of another meeting', async () => {
        mockSubjectFindUnique.mockResolvedValue({ cityId: 'athens', councilMeetingId: 'unreleased' });

        await expect(upsertHighlightCore(USER, { ...DATA, subjectId: 's1' })).rejects.toThrow('The subject must belong to the specified meeting');
        expect(mockHighlightUpsert).not.toHaveBeenCalled();
    });

    it('refuses an unknown subject', async () => {
        mockSubjectFindUnique.mockResolvedValue(null);

        await expect(upsertHighlightCore(USER, { ...DATA, subjectId: 's1' })).rejects.toThrow('Unknown subject id');
    });

    it('does not look the subject up when none is given', async () => {
        await upsertHighlightCore(USER, DATA);

        expect(mockSubjectFindUnique).not.toHaveBeenCalled();
    });
});

describe('upsertHighlightCore kept subject on update', () => {
    beforeEach(() => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightUpsert.mockResolvedValue({ id: 'h1' });
    });

    // A highlight linked to a foreign subject before the scope check existed.
    const foreign = { cityId: 'athens', meetingId: 'm1', createdById: 'u1', subject: { cityId: 'athens', councilMeetingId: 'unreleased' } };

    it('refuses an update that keeps a subject of another meeting', async () => {
        mockHighlightFindUnique.mockResolvedValue(foreign);

        await expect(upsertHighlightCore(USER, { ...DATA, id: 'h1' })).rejects.toThrow('belongs to another meeting');
        expect(mockHighlightUpsert).not.toHaveBeenCalled();
    });

    it('allows the update that clears that subject', async () => {
        mockHighlightFindUnique.mockResolvedValue(foreign);

        await upsertHighlightCore(USER, { ...DATA, id: 'h1', subjectId: null });

        expect(mockHighlightUpsert).toHaveBeenCalled();
    });

    it('allows an update that keeps a subject of the same meeting', async () => {
        mockHighlightFindUnique.mockResolvedValue({ ...foreign, subject: { cityId: 'athens', councilMeetingId: 'm1' } });

        await upsertHighlightCore(USER, { ...DATA, id: 'h1' });

        expect(mockHighlightUpsert).toHaveBeenCalled();
    });
});
