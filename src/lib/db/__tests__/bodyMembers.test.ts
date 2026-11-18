/** @jest-environment node */

const mockBodyFindFirst = jest.fn();
const mockRoleUpdateMany = jest.fn();
const mockRoleFindMany = jest.fn();
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
        role: {
            updateMany: (...args: unknown[]) => mockRoleUpdateMany(...args),
            findMany: (...args: unknown[]) => mockRoleFindMany(...args),
            aggregate: (...args: unknown[]) => mockRoleAggregate(...args),
        },
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

import { defaultImportStart, endBodyMembership, getBodyClaimLinks, importBodyMembers, requireBody, startNewTerm } from '../bodyMembers';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';

const BODY = { id: 'youth', name: 'ΔΣΝ', name_en: 'Youth Council', type: 'youthCouncil' as const, city: { id: 'chania', name: 'Χανιά', realm: 'greece' as const, timezone: 'Europe/Athens', language: 'el' as const } };
const AT = new Date('2026-10-09T10:00:00Z');

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockBodyFindFirst.mockResolvedValue(BODY);
    mockRoleUpdateMany.mockResolvedValue({ count: 1 });
    mockRoleFindMany.mockResolvedValue([{ id: 'r1', startDate: new Date('2026-01-01T00:00:00Z') }]);
    mockRoleCreate.mockResolvedValue({});
    mockRoleAggregate.mockResolvedValue({ _max: { endDate: null } });
    mockPersonCreate.mockImplementation(({ data }: { data: { name: string } }) => Promise.resolve({ id: `new-${data.name}`, name: data.name }));
    mockGetClaimedPersonIds.mockResolvedValue(new Set());
});

describe('requireBody, the gate of the roster tools', () => {
    it('asks for the body scope and refuses a body of another city', async () => {
        mockBodyFindFirst.mockResolvedValue(null);
        await expect(requireBody('chania', 'youth')).rejects.toThrow(NotFoundError);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'chania', administrativeBodyId: 'youth' });
        expect(mockBodyFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'youth', cityId: 'chania' } }));
    });
});

describe('endBodyMembership', () => {
    it('ends the active roles of the person on the body, and no other role', async () => {
        await expect(endBodyMembership(BODY, 'p1', AT)).resolves.toEqual({ ended: 1 });
        const { where } = mockRoleFindMany.mock.calls[0][0];
        expect(where).toMatchObject({ personId: 'p1', person: { cityId: 'chania' }, administrativeBodyId: 'youth' });
        expect(where.OR).toBeDefined();
        expect(mockRoleUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['r1'] } }, data: { endDate: AT } });
    });

    it('takes a past end date for a role that started before it', async () => {
        const past = new Date('2026-03-01T00:00:00Z');
        await expect(endBodyMembership(BODY, 'p1', past)).resolves.toEqual({ ended: 1 });
        expect(mockRoleUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['r1'] } }, data: { endDate: past } });
    });

    it('answers 400 for an end date before the start of a role, and ends no role', async () => {
        mockRoleFindMany.mockResolvedValue([{ id: 'r1', startDate: null }, { id: 'r2', startDate: new Date('2026-10-20T00:00:00Z') }]);
        await expect(endBodyMembership(BODY, 'p1', AT)).rejects.toThrow(BadRequestError);
        expect(mockRoleUpdateMany).not.toHaveBeenCalled();
    });

    it('answers 404 when the person holds no active role on the body', async () => {
        mockRoleFindMany.mockResolvedValue([]);
        await expect(endBodyMembership(BODY, 'p1', AT)).rejects.toThrow(NotFoundError);
        expect(mockRoleUpdateMany).not.toHaveBeenCalled();
    });
});

describe('startNewTerm', () => {
    it('ends every active role on the body that started before the day of the end', async () => {
        mockRoleUpdateMany.mockResolvedValue({ count: 7 });
        await expect(startNewTerm(BODY, AT)).resolves.toEqual({ ended: 7 });
        const { where, data } = mockRoleUpdateMany.mock.calls[0][0];
        // The end keeps its exact moment.
        expect(data).toEqual({ endDate: AT });
        expect(where).toMatchObject({ administrativeBodyId: 'youth' });
        expect(where.OR).toBeDefined();
        expect(where.personId).toBeUndefined();
        // A member of the new term whom the admin added first keeps the role,
        // even when it starts at 00:00 of the day and the term ends at 13:00
        // (the default day sends no date, so the end is now). The day is
        // the city's: 9 Oct starts at 21:00Z on 8 Oct in Athens.
        expect(where.AND).toEqual([{ OR: [{ startDate: null }, { startDate: { lt: new Date('2026-10-08T21:00:00Z') } }] }]);
    });

    it('refuses a council, whose seats end after an election, and ends no role', async () => {
        await expect(startNewTerm({ ...BODY, type: 'council' }, AT)).rejects.toThrow(ConflictError);
        expect(mockRoleUpdateMany).not.toHaveBeenCalled();
    });
});

describe('an end after today in the city', () => {
    // 13:00 in Athens on 9 Oct. Today ends at 21:00Z, when 10 Oct starts in Athens.
    beforeEach(() => jest.useFakeTimers({ now: AT }));
    afterEach(() => jest.useRealTimers());

    const lastMomentOfToday = new Date('2026-10-09T20:59:59.999Z');
    const tomorrow = new Date('2026-10-09T21:00:00Z');

    it('ends a membership on the last moment of today', async () => {
        await expect(endBodyMembership(BODY, 'p1', lastMomentOfToday)).resolves.toEqual({ ended: 1 });
    });

    it('answers 400 to a membership that ends tomorrow, and ends no role', async () => {
        await expect(endBodyMembership(BODY, 'p1', tomorrow)).rejects.toThrow(new BadRequestError('The end date must not be after today.'));
        expect(mockRoleUpdateMany).not.toHaveBeenCalled();
    });

    it('answers 400 to a term that ends tomorrow, and ends no role', async () => {
        await expect(startNewTerm(BODY, tomorrow)).rejects.toThrow(new BadRequestError('The end date must not be after today.'));
        expect(mockRoleUpdateMany).not.toHaveBeenCalled();
    });
});

describe('defaultImportStart', () => {
    it('is where the last membership of the body ended, as the import reads it', async () => {
        const termEnd = new Date('2026-09-01T00:00:00Z');
        mockRoleAggregate.mockResolvedValue({ _max: { endDate: termEnd } });
        await expect(defaultImportStart(BODY)).resolves.toEqual(termEnd);
        expect(mockRoleAggregate).toHaveBeenCalledWith({
            where: { administrativeBodyId: 'youth', endDate: { lte: expect.any(Date) } },
            _max: { endDate: true },
        });
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

        const result = await importBodyMembers(BODY, [
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
        const result = await importBodyMembers(BODY, [entry('Ελένη Νέα'), entry('Ελένη Νέα')]);
        expect(result).toEqual({ created: 1, joined: 0, skipped: 1 });
        expect(mockPersonCreate).toHaveBeenCalledTimes(1);
    });

    it('starts an open-start import where the last membership of the body ended, so a new term stays out of the old minutes', async () => {
        const termEnd = new Date('2026-09-01T00:00:00Z');
        mockRoleAggregate.mockResolvedValue({ _max: { endDate: termEnd } });
        mockPersonFindMany.mockResolvedValue([{ id: 'p2', name: 'Γιώργος Νεαρός', roles: [] }]);

        await importBodyMembers(BODY, [entry('Γιώργος Νεαρός'), entry('Ελένη Νέα')]);

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
        await importBodyMembers(BODY, [entry('Ελένη Νέα')]);
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

        const links = await getBodyClaimLinks(BODY);

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
