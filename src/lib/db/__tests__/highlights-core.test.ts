/** @jest-environment node */

const mockCityFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockHighlightFindUnique = jest.fn();
const mockHighlightUpsert = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        city: { findUnique: (...args: unknown[]) => mockCityFindUnique(...args) },
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        highlight: {
            findUnique: (...args: unknown[]) => mockHighlightFindUnique(...args),
            upsert: (...args: unknown[]) => mockHighlightUpsert(...args),
        },
    },
}));

import { upsertHighlightCore, canUserEditCity, canActorManageHighlight } from '../highlights-core';
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

function setUser(user: { isSuperAdmin?: boolean; administers?: { cityId: string | null }[] } | null) {
    mockUserFindUnique.mockResolvedValue(
        user ? { isSuperAdmin: user.isSuperAdmin ?? false, administers: user.administers ?? [] } : null
    );
}

beforeEach(() => {
    jest.clearAllMocks();
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

describe('canActorManageHighlight', () => {
    const highlight = { cityId: 'athens', createdById: 'u1' };

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
        expect(await canActorManageHighlight(USER, { cityId: 'athens', createdById: null })).toBe(false);
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
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'athens', createdById: 'u1' });
        await expect(upsertHighlightCore(OTHER_USER, { ...DATA, id: 'h1' })).rejects.toThrow(ForbiddenError);
    });

    it('EVERYONE: owners can edit their own highlights', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'athens', createdById: 'u1' });
        await expect(upsertHighlightCore(USER, { ...DATA, id: 'h1' })).resolves.toMatchObject({ id: 'h1' });
    });

    it('rejects edits to highlights of another city', async () => {
        setCityPermission('EVERYONE');
        setUser({ administers: [] });
        mockHighlightFindUnique.mockResolvedValue({ cityId: 'argos', createdById: 'u1' });
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
