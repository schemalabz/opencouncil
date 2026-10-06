/** @jest-environment node */

const mockCityFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockHighlightFindUnique = jest.fn();
const mockHighlightUpsert = jest.fn();
const mockMeetingFindUnique = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        city: { findUnique: (...args: unknown[]) => mockCityFindUnique(...args) },
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        councilMeeting: { findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args) },
        highlight: {
            findUnique: (...args: unknown[]) => mockHighlightFindUnique(...args),
            upsert: (...args: unknown[]) => mockHighlightUpsert(...args),
        },
    },
}));

import {
    upsertHighlightCore, canUserEditCity, canUserEditMeeting, canUserEditBody, canActorManageHighlight, getUserCityRights,
} from '../highlights-core';
import { ForbiddenError, NotFoundError, BadRequestError } from '../../api/errors';

const DATA = {
    name: 'Test highlight',
    meetingId: 'm1',
    cityId: 'athens',
    utteranceIds: ['utt1', 'utt2'],
};

const USER = { type: 'user', userId: 'u1' } as const;
const OTHER_USER = { type: 'user', userId: 'u2' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

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

beforeEach(() => {
    jest.clearAllMocks();
    mockMeetingFindUnique.mockResolvedValue(null);
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

describe('canUserEditBody', () => {
    it('is true for superadmins, city admins and the admin of that body in that city', async () => {
        setUser({ isSuperAdmin: true });
        expect(await canUserEditBody('u1', 'athens', 'council')).toBe(true);
        setUser({ administers: [{ cityId: 'athens' }] });
        expect(await canUserEditBody('u1', 'athens', 'council')).toBe(true);
        setUser({ administers: [bodyAdminOf('council', 'athens')] });
        expect(await canUserEditBody('u1', 'athens', 'council')).toBe(true);
        expect(await canUserEditBody('u1', 'athens', 'committee')).toBe(false);
        expect(await canUserEditBody('u1', 'argos', 'council')).toBe(false);
    });
});

describe('canActorManageHighlight', () => {
    const highlight = { cityId: 'athens', meetingId: 'm1', createdById: 'u1' };

    it('allows service actors unconditionally', async () => {
        expect(await canActorManageHighlight(SERVICE, highlight)).toBe(true);
        expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('allows the owner without a city-permission lookup', async () => {
        expect(await canActorManageHighlight(USER, highlight)).toBe(true);
        expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('allows city editors and rejects unrelated users', async () => {
        setUser({ administers: [{ cityId: 'athens' }] });
        expect(await canActorManageHighlight(OTHER_USER, highlight)).toBe(true);

        setUser({ administers: [] });
        expect(await canActorManageHighlight(OTHER_USER, highlight)).toBe(false);

        // unattributed (service-created) highlight: only editors may manage
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

    it('ADMINS_ONLY: allows service identity without any user lookup', async () => {
        setCityPermission('ADMINS_ONLY');
        await expect(upsertHighlightCore(SERVICE, DATA)).resolves.toMatchObject({ id: 'h1' });
        expect(mockUserFindUnique).not.toHaveBeenCalled();
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

    it('attributes user-created highlights and leaves service ones unattributed', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });

        await upsertHighlightCore(USER, DATA);
        expect(mockHighlightUpsert.mock.calls[0][0].create.createdBy).toEqual({ connect: { id: 'u1' } });

        mockHighlightUpsert.mockClear();
        await upsertHighlightCore(SERVICE, DATA);
        expect(mockHighlightUpsert.mock.calls[0][0].create.createdBy).toBeUndefined();
    });
});
