/**
 * The authorization rules of src/lib/auth.ts for an admin of one
 * administrative body (#828): what the body scope and the meeting scope open,
 * what the city scope keeps closed, and which persons are theirs.
 */
const mockAuth = jest.fn();
const mockUserFindUnique = jest.fn();
const mockMeetingFindUnique = jest.fn();
const mockBodyFindUnique = jest.fn();
const mockPersonFindUnique = jest.fn();
const mockPartyFindUnique = jest.fn();

jest.mock('@/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
jest.mock('@/lib/db/apiKeys', () => ({ validateServiceApiKey: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
        councilMeeting: { findUnique: (...args: unknown[]) => mockMeetingFindUnique(...args) },
        administrativeBody: { findUnique: (...args: unknown[]) => mockBodyFindUnique(...args) },
        person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args) },
        party: { findUnique: (...args: unknown[]) => mockPartyFindUnique(...args) },
    },
}));

import { isUserAuthorizedToEdit, getUnreleasedScope, getRoleLimitForCity, personIsOwnedByBodyAdmin } from '../auth';

type Row = { cityId?: string | null; partyId?: string | null; personId?: string | null; administrativeBodyId?: string | null };

function signIn(user: { isSuperAdmin?: boolean; administers: Row[] } | null) {
    mockAuth.mockResolvedValue(user ? { user: { email: 'u@test' } } : null);
    mockUserFindUnique.mockResolvedValue(user && {
        id: 'u1',
        isSuperAdmin: user.isSuperAdmin ?? false,
        administers: user.administers.map((row, i) => ({
            id: `a${i}`,
            cityId: row.cityId ?? null,
            partyId: row.partyId ?? null,
            personId: row.personId ?? null,
            administrativeBodyId: row.administrativeBodyId ?? null,
            city: null,
            party: null,
            person: null,
            administrativeBody: row.administrativeBodyId ? { id: row.administrativeBodyId, cityId: BODIES[row.administrativeBodyId] } : null,
        })),
    });
}

// youth and culture are bodies of athens; argosYouth is a body of argos
const BODIES: Record<string, string> = { youth: 'athens', culture: 'athens', argosYouth: 'argos' };

const MEETINGS: Record<string, string | null> = { ym1: 'youth', cm1: 'culture', council1: null };

beforeEach(() => {
    jest.clearAllMocks();
    mockBodyFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id in BODIES ? { cityId: BODIES[where.id] } : null));
    mockMeetingFindUnique.mockImplementation(({ where }: { where: { cityId_id: { cityId: string; id: string } } }) => {
        const { cityId, id } = where.cityId_id;
        if (cityId !== 'athens' || !(id in MEETINGS)) return Promise.resolve(null);
        return Promise.resolve({ administrativeBodyId: MEETINGS[id] });
    });
});

describe('a body admin', () => {
    beforeEach(() => signIn({ administers: [{ administrativeBodyId: 'youth' }] }));

    it('never passes the city scope alone', async () => {
        expect(await isUserAuthorizedToEdit({ cityId: 'athens' })).toBe(false);
        expect(await isUserAuthorizedToEdit({})).toBe(false);
    });

    it('passes for a meeting of their body and no other', async () => {
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'ym1' })).toBe(true);
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'cm1' })).toBe(false);
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'council1' })).toBe(false);
    });

    it('answers false, not a throw, for a meeting that does not exist', async () => {
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'missing' })).toBe(false);
    });

    it('passes for their body and no other', async () => {
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', administrativeBodyId: 'youth' })).toBe(true);
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', administrativeBodyId: 'culture' })).toBe(false);
        // the body is theirs, but it is not a body of the named city
        expect(await isUserAuthorizedToEdit({ cityId: 'argos', administrativeBodyId: 'youth' })).toBe(false);
    });

    it('owns a person whose every role is on their body', async () => {
        mockPersonFindUnique.mockResolvedValue({ cityId: 'athens', roles: [{ administrativeBodyId: 'youth' }, { administrativeBodyId: 'youth' }] });
        expect(await isUserAuthorizedToEdit({ personId: 'p1' })).toBe(true);
    });

    it('does not own a person with no role, or with a role elsewhere', async () => {
        mockPersonFindUnique.mockResolvedValue({ cityId: 'athens', roles: [] });
        expect(await isUserAuthorizedToEdit({ personId: 'p1' })).toBe(false);

        mockPersonFindUnique.mockResolvedValue({ cityId: 'athens', roles: [{ administrativeBodyId: 'youth' }, { administrativeBodyId: null }] });
        expect(await isUserAuthorizedToEdit({ personId: 'p1' })).toBe(false);

        mockPersonFindUnique.mockResolvedValue({ cityId: 'athens', roles: [{ administrativeBodyId: 'youth' }, { administrativeBodyId: 'culture' }] });
        expect(await isUserAuthorizedToEdit({ personId: 'p1' })).toBe(false);
    });

    it('sees the unreleased meetings of their body only', async () => {
        expect(await getUnreleasedScope('athens')).toEqual({ all: false, bodyIds: ['youth'] });
        expect(await getUnreleasedScope('argos')).toEqual({ all: false, bodyIds: [] });
    });

    it('gives roles on their body only', async () => {
        expect(await getRoleLimitForCity('athens')).toEqual(new Set(['youth']));
        expect(await getRoleLimitForCity('argos')).toEqual(new Set());
    });
});

describe('a city admin', () => {
    beforeEach(() => signIn({ administers: [{ cityId: 'athens' }] }));

    it('passes the meeting and body scopes of their city', async () => {
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'ym1' })).toBe(true);
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', administrativeBodyId: 'culture' })).toBe(true);
    });

    it('does not pass for a body of another city named with their city', async () => {
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', administrativeBodyId: 'argosYouth' })).toBe(false);
    });

    it('sees every unreleased meeting and gives any role', async () => {
        expect(await getUnreleasedScope('athens')).toEqual({ all: true });
        expect(await getRoleLimitForCity('athens')).toBeNull();
    });
});

describe('a reader', () => {
    it('sees no unreleased meeting and gives no role', async () => {
        signIn({ administers: [] });
        expect(await getUnreleasedScope('athens')).toEqual({ all: false, bodyIds: [] });
        expect(await getRoleLimitForCity('athens')).toEqual(new Set());

        signIn(null);
        expect(await getUnreleasedScope('athens')).toEqual({ all: false, bodyIds: [] });
        expect(await isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'ym1' })).toBe(false);
    });
});

describe('the scope shapes', () => {
    it('rejects a meeting or a body without a city', async () => {
        signIn({ isSuperAdmin: true, administers: [] });
        await expect(isUserAuthorizedToEdit({ councilMeetingId: 'ym1' })).rejects.toThrow();
        await expect(isUserAuthorizedToEdit({ administrativeBodyId: 'youth' })).rejects.toThrow();
        await expect(isUserAuthorizedToEdit({ cityId: 'athens', councilMeetingId: 'ym1', administrativeBodyId: 'youth' })).rejects.toThrow();
    });
});

describe('personIsOwnedByBodyAdmin', () => {
    const held = new Set(['youth']);
    it('needs at least one role, each on a held body', () => {
        expect(personIsOwnedByBodyAdmin([], held)).toBe(false);
        expect(personIsOwnedByBodyAdmin([{ administrativeBodyId: 'youth' }], held)).toBe(true);
        expect(personIsOwnedByBodyAdmin([{ administrativeBodyId: 'youth' }, { administrativeBodyId: undefined }], held)).toBe(false);
    });
});
