/** @jest-environment node */

const mockBodyFindFirst = jest.fn();
const mockRoleUpdateMany = jest.fn();
const mockRoleCreate = jest.fn();
const mockRoleAggregate = jest.fn();
const mockPersonFindMany = jest.fn();
const mockPersonCreate = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();
const mockGetClaimedPersonIds = jest.fn();

jest.mock('server-only', () => ({}));
const tx = {
    person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args), create: (...args: unknown[]) => mockPersonCreate(...args) },
    role: { create: (...args: unknown[]) => mockRoleCreate(...args), aggregate: (...args: unknown[]) => mockRoleAggregate(...args) },
};
jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        administrativeBody: { findFirst: (...args: unknown[]) => mockBodyFindFirst(...args) },
        role: { updateMany: (...args: unknown[]) => mockRoleUpdateMany(...args) },
        person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args) },
        $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args) }));
jest.mock('../personClaim', () => ({ getClaimedPersonIds: (...args: unknown[]) => mockGetClaimedPersonIds(...args) }));
jest.mock('@/lib/auth/personClaim', () => ({
    claimExpiry: () => new Date('2026-10-14T12:00:00Z'),
    claimLastValidDay: (d: Date) => new Date(d.getTime() - 24 * 60 * 60 * 1000),
    personJoinUrl: (person: { id: string }) => `https://opencouncil.gr/chania/join/${person.id}`,
}));

import { endBodyMembership, getBodyClaimLinks, importBodyMembers, startNewTerm } from '../bodyMembers';
import { NotFoundError } from '@/lib/api/errors';

const BODY = { id: 'youth', name: 'ΔΣΝ', name_en: 'Youth Council', city: { id: 'chania', name: 'Χανιά', realm: 'greece', timezone: 'Europe/Athens', language: 'el' } };
const AT = new Date('2026-10-09T10:00:00Z');

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockBodyFindFirst.mockResolvedValue(BODY);
    mockRoleUpdateMany.mockResolvedValue({ count: 1 });
    mockRoleCreate.mockResolvedValue({});
    mockRoleAggregate.mockResolvedValue({ _max: { endDate: null } });
    mockPersonCreate.mockImplementation(({ data }: { data: { name: string } }) => Promise.resolve({ id: `new-${data.name}`, name: data.name }));
    mockGetClaimedPersonIds.mockResolvedValue(new Set());
});

describe('the roster tools gate on the body', () => {
    it('ask for the body scope and refuse a body of another city', async () => {
        mockBodyFindFirst.mockResolvedValue(null);
        await expect(startNewTerm('chania', 'youth', AT)).rejects.toThrow(NotFoundError);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'chania', administrativeBodyId: 'youth' });
        expect(mockRoleUpdateMany).not.toHaveBeenCalled();
    });
});

describe('endBodyMembership', () => {
    it('ends the active roles of the person on the body, and no other role', async () => {
        await expect(endBodyMembership('chania', 'youth', 'p1', AT)).resolves.toEqual({ ended: 1 });
        const { where, data } = mockRoleUpdateMany.mock.calls[0][0];
        expect(data).toEqual({ endDate: AT });
        expect(where).toMatchObject({ personId: 'p1', person: { cityId: 'chania' }, administrativeBodyId: 'youth' });
        expect(where.OR).toBeDefined();
    });

    it('answers 404 when the person holds no active role on the body', async () => {
        mockRoleUpdateMany.mockResolvedValue({ count: 0 });
        await expect(endBodyMembership('chania', 'youth', 'p1', AT)).rejects.toThrow(NotFoundError);
    });
});

describe('startNewTerm', () => {
    it('ends every active role on the body at the date', async () => {
        mockRoleUpdateMany.mockResolvedValue({ count: 7 });
        await expect(startNewTerm('chania', 'youth', AT)).resolves.toEqual({ ended: 7 });
        const { where, data } = mockRoleUpdateMany.mock.calls[0][0];
        expect(data).toEqual({ endDate: AT });
        expect(where).toMatchObject({ administrativeBodyId: 'youth' });
        expect(where.personId).toBeUndefined();
    });
});

describe('importBodyMembers', () => {
    const entry = (name: string, extra: Record<string, unknown> = {}) => ({
        name, name_en: name, name_short: name, name_short_en: name, roleName: null, roleName_en: null, isHead: false, ...extra,
    });

    it('creates a new person with the role, gives an existing person the role, and leaves a member alone', async () => {
        mockPersonFindMany.mockResolvedValue([
            { id: 'p1', name: 'Μαρία Νεανίδη', roles: [{ id: 'r1' }] },
            { id: 'p2', name: 'Γιώργος  Νεαρός', roles: [] },
        ]);

        const result = await importBodyMembers('chania', 'youth', [
            entry('Μαρία Νεανίδη', { roleName: 'Πρόεδρος', isHead: true }),
            entry('γιώργος νεαρός'),
            entry('Ελένη Νέα', { roleName: 'Γραμματέας', roleName_en: 'Secretary' }),
        ], { startDate: AT });

        expect(result).toEqual({ created: 1, joined: 1, skipped: 1 });
        // An explicit start date asks nothing of the roles of the body.
        expect(mockRoleAggregate).not.toHaveBeenCalled();
        // A name is matched among the people of this body and the people with
        // no role: a namesake on the municipality's roster is another person.
        expect(mockPersonFindMany.mock.calls[0][0].where).toEqual({
            cityId: 'chania',
            OR: [{ roles: { none: {} } }, { roles: { some: { administrativeBodyId: 'youth' } } }],
        });
        expect(mockRoleCreate).toHaveBeenCalledWith({
            data: { administrativeBodyId: 'youth', name: null, name_en: null, isHead: false, startDate: AT, personId: 'p2' },
        });
        expect(mockPersonCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                cityId: 'chania', name: 'Ελένη Νέα',
                roles: { create: [{ administrativeBodyId: 'youth', name: 'Γραμματέας', name_en: 'Secretary', isHead: false, startDate: AT }] },
            }),
        }));
    });

    it('creates one person for a name that the list repeats', async () => {
        mockPersonFindMany.mockResolvedValue([]);
        const result = await importBodyMembers('chania', 'youth', [entry('Ελένη Νέα'), entry('Ελένη Νέα')]);
        expect(result).toEqual({ created: 1, joined: 0, skipped: 1 });
        expect(mockPersonCreate).toHaveBeenCalledTimes(1);
    });

    it('starts an open-start import where the last membership of the body ended, so a new term stays out of the old minutes', async () => {
        const termEnd = new Date('2026-09-01T00:00:00Z');
        mockRoleAggregate.mockResolvedValue({ _max: { endDate: termEnd } });
        mockPersonFindMany.mockResolvedValue([{ id: 'p2', name: 'Γιώργος Νεαρός', roles: [] }]);

        await importBodyMembers('chania', 'youth', [entry('Γιώργος Νεαρός'), entry('Ελένη Νέα')]);

        expect(mockRoleAggregate).toHaveBeenCalledWith({
            where: { administrativeBodyId: 'youth', endDate: { lte: expect.any(Date) } },
            _max: { endDate: true },
        });
        expect(mockRoleCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ personId: 'p2', startDate: termEnd }) });
        expect(mockPersonCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ roles: { create: [expect.objectContaining({ startDate: termEnd })] } }),
        }));
    });

    it('keeps the open start on a body whose roles never ended: a first list counts at every past meeting', async () => {
        mockPersonFindMany.mockResolvedValue([]);
        await importBodyMembers('chania', 'youth', [entry('Ελένη Νέα')]);
        expect(mockPersonCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ roles: { create: [expect.objectContaining({ startDate: null })] } }),
        }));
    });
});

describe('getBodyClaimLinks', () => {
    it('gives a link to each active member without an account, in the order of the body', async () => {
        const role = (name: string | null, isHead: boolean, electedOrder: number | null) => ({
            id: 'r', personId: 'p', cityId: null, partyId: null, administrativeBodyId: 'youth', isHead, name, name_en: null,
            electedOrder, startDate: null, endDate: null, createdAt: AT, updatedAt: AT,
            administrativeBody: { id: 'youth', name: 'ΔΣΝ', type: 'youthCouncil' },
        });
        mockPersonFindMany.mockResolvedValue([
            { id: 'p2', name: 'Γιώργος Νεαρός', cityId: 'chania', roles: [role(null, false, 2)] },
            { id: 'p1', name: 'Μαρία Νεανίδη', cityId: 'chania', roles: [role('Πρόεδρος', true, 1)] },
            { id: 'p3', name: 'Νίκος Λογαριασμός', cityId: 'chania', roles: [role(null, false, 3)] },
        ]);
        mockGetClaimedPersonIds.mockResolvedValue(new Set(['p3']));

        const links = await getBodyClaimLinks('chania', 'youth');

        // A link claims the whole person: a member with a seat elsewhere in
        // the municipality is left to the city admin.
        expect(mockPersonFindMany.mock.calls[0][0].where).toEqual({
            cityId: 'chania',
            roles: {
                some: { administrativeBodyId: 'youth', OR: expect.any(Array) },
                none: { OR: [{ administrativeBodyId: null }, { administrativeBodyId: { not: 'youth' } }] },
            },
        });
        expect(links.people.map(person => person.id)).toEqual(['p1', 'p2']);
        expect(links.people[0]).toEqual({ id: 'p1', name: 'Μαρία Νεανίδη', role: 'Πρόεδρος', joinUrl: 'https://opencouncil.gr/chania/join/p1' });
        expect(links.validUntil).toBe('2026-10-13T12:00:00.000Z');
    });
});
