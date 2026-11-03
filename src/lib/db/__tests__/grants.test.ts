/**
 * The single-request rules of the grants module: who may give or take a
 * grant, the cap, the duplicate, the machine address, the claimed row and
 * the last admin. The concurrent cases need the lock of a real database
 * (tests/integration/grants.test.ts).
 */
const mockGetCurrentUser = jest.fn();
const mockSendInviteEmail = jest.fn();
const db = {
    city: { findUnique: jest.fn() },
    administrativeBody: { findUnique: jest.fn() },
    party: { findUnique: jest.fn() },
    person: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    administers: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $executeRaw: jest.fn(),
};

jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));
jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: (...a: unknown[]) => mockSendInviteEmail(...a) }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { ...db, $transaction: jest.fn((fn: (tx: typeof db) => unknown) => fn(db)) },
}));

import prisma from '@/lib/db/prisma';
import { inviteGrant, listGrants, revokeGrant, MAX_GRANTS_PER_SCOPE } from '@/lib/db/grants';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { grant, bodyGrant, cityGrant, realmGrant } from '@/lib/auth/__tests__/fixtures';
import type { ActiveGrant } from '@/lib/auth/rights';

const CITIES: Record<string, { realm: string }> = { athens: { realm: 'greece' }, argos: { realm: 'greece' }, lyon: { realm: 'france' } };
const BODIES: Record<string, { cityId: string }> = { youth: { cityId: 'athens' }, other: { cityId: 'athens' } };

const viewer = (grants: ActiveGrant[], isSuperAdmin = false) => ({ id: 'viewer', name: 'Viewer', email: 'viewer@example.org', isSuperAdmin, administers: grants });
const signIn = (grants: ActiveGrant[], isSuperAdmin = false) => mockGetCurrentUser.mockResolvedValue(viewer(grants, isSuperAdmin));

const row = (data: Record<string, unknown>) => ({
    id: 'g1', role: 'admin', realm: null, cityId: null, partyId: null, personId: null, administrativeBodyId: null,
    claimedAt: null, acceptedAt: new Date('2026-01-01'), revokedAt: null, createdAt: new Date('2026-01-01'),
    user: { isMachine: false },
    ...data,
});

/** The account an invited email names: none, one that never signed in, or one that did. */
const account = (id: string | null, signedIn = true) => db.user.findUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => {
    if (select.id) return id ? { id } : null;
    return { emailVerified: signedIn ? new Date('2026-01-01') : null, _count: { accounts: 0, sessions: 0 } };
});

/** The relations of a created row, as grantRowSelect reads them, from the columns of the create. */
const relationsOf = (data: Record<string, unknown>) => ({
    city: data.cityId ? { id: data.cityId, name: 'Athens' } : null,
    administrativeBody: data.administrativeBodyId ? { id: data.administrativeBodyId, name: 'Youth', cityId: 'athens', city: { name: 'Athens' } } : null,
    party: data.partyId ? { id: data.partyId, name: 'Party', cityId: 'athens', city: { name: 'Athens' } } : null,
    person: null,
});

const code = async (promise: Promise<unknown>, expected: string) => {
    await expect(promise).rejects.toThrow(BadRequestError);
    await expect(promise).rejects.toThrow(expected);
};

beforeEach(() => {
    jest.clearAllMocks();
    db.city.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => CITIES[where.id] ?? null);
    db.administrativeBody.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
        const body = BODIES[where.id];
        return body ? { cityId: body.cityId, city: CITIES[body.cityId] } : null;
    });
    account(null);
    db.user.create.mockResolvedValue({ id: 'new-user' });
    db.administers.findFirst.mockResolvedValue(null);
    db.administers.findMany.mockResolvedValue([]);
    db.administers.count.mockResolvedValue(0);
    db.administers.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
        row({ id: 'created', createdAt: new Date(), ...data, ...relationsOf(data), user: { id: 'u', email: 'clerk@example.org', name: 'Clerk', isMachine: false } }));
    db.administers.update.mockResolvedValue({});
    db.administers.updateMany.mockResolvedValue({ count: 1 });
    mockSendInviteEmail.mockResolvedValue(true);
});

describe('inviteGrant', () => {
    const invite = { email: 'clerk@example.org', role: 'records' as const, scope: { cityId: 'athens' } };

    it('refuses with no session', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        await expect(inviteGrant(invite)).rejects.toThrow(UnauthorizedError);
    });

    it('refuses a city admin of argos on athens', async () => {
        signIn([cityGrant('argos')]);
        await expect(inviteGrant(invite)).rejects.toThrow(ForbiddenError);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a realm admin a realm grant, which only a superadmin gives', async () => {
        signIn([realmGrant('greece')]);
        await expect(inviteGrant({ ...invite, scope: { realm: 'greece' } })).rejects.toThrow(ForbiddenError);
    });

    // A row on a person speaks for the person: setVoicePrintConsent takes it.
    it('refuses a realm admin a grant on a person, which only a superadmin gives', async () => {
        signIn([realmGrant('greece')]);
        db.person.findUnique.mockResolvedValue({ cityId: 'athens', city: CITIES.athens, roles: [] });
        await expect(inviteGrant({ ...invite, role: 'viewer', scope: { personId: 'p1' } })).rejects.toThrow(ForbiddenError);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets a superadmin give a realm grant', async () => {
        signIn([], true);
        const result = await inviteGrant({ ...invite, role: 'admin', scope: { realm: 'greece' } });
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({
            data: { role: 'admin', realm: 'greece', userId: 'new-user', grantedById: 'viewer', acceptedAt: null },
        }));
        expect(result.status).toBe('pending');
        expect(mockSendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ realm: 'greece', pending: true, grant: expect.objectContaining({ path: '/admin' }) }));
    });

    it('lets a realm admin of greece invite on a body of athens', async () => {
        signIn([realmGrant('greece')]);
        await inviteGrant({ ...invite, scope: { administrativeBodyId: 'youth' } });
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ administrativeBodyId: 'youth', role: 'records' }),
        }));
    });

    it('answers not found for a scope that does not exist', async () => {
        signIn([], true);
        await expect(inviteGrant({ ...invite, scope: { cityId: 'atlantis' } })).rejects.toThrow(NotFoundError);
    });

    it('refuses a machine address before any account is read or created', async () => {
        signIn([cityGrant('athens')]);
        await code(inviteGrant({ ...invite, email: 'Paola@machines.opencouncil.invalid' }), 'machine-address');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses the invite past the cap of the scope', async () => {
        signIn([cityGrant('athens')]);
        db.administers.findMany.mockResolvedValue(Array.from({ length: MAX_GRANTS_PER_SCOPE }, (_, i) => ({ userId: `holder-${i}` })));
        await code(inviteGrant(invite), 'cap');
        expect(db.administers.findMany).toHaveBeenCalledWith({
            where: { cityId: 'athens', revokedAt: null, OR: [{ acceptedAt: { not: null } }, { createdAt: { gte: expect.any(Date) } }], user: { isMachine: false } },
            select: { userId: true },
            distinct: ['userId'],
        });
        expect(db.administers.create).not.toHaveBeenCalled();
        expect(db.user.create).not.toHaveBeenCalled();
    });

    it('counts people against the cap, not roles: a holder of the scope takes a second role past it', async () => {
        signIn([cityGrant('athens')]);
        account('holder-3');
        db.administers.findMany.mockResolvedValue(Array.from({ length: MAX_GRANTS_PER_SCOPE }, (_, i) => ({ userId: `holder-${i}` })));
        await inviteGrant({ ...invite, role: 'records' });
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'holder-3', role: 'records' }) }));
    });

    it('refuses the same role on the same scope for the same account twice', async () => {
        signIn([cityGrant('athens')]);
        account('existing');
        db.administers.findFirst.mockResolvedValue({ id: 'held', acceptedAt: new Date('2026-01-01') });
        await code(inviteGrant(invite), 'duplicate');
        expect(db.administers.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: 'existing', role: 'records', cityId: 'athens', revokedAt: null },
        }));
        expect(db.administers.create).not.toHaveBeenCalled();
    });

    it('creates an account for a new email, keeps the row pending, and sends the invite', async () => {
        signIn([cityGrant('athens')]);
        const result = await inviteGrant({ ...invite, email: ' Clerk@Example.org ', name: ' Clerk ' });
        expect(db.user.create).toHaveBeenCalledWith({ data: { email: 'clerk@example.org', name: 'Clerk' }, select: { id: true } });
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'new-user', acceptedAt: null }) }));
        expect(db.administers.update).not.toHaveBeenCalled();
        expect(mockSendInviteEmail).toHaveBeenCalledWith({
            email: 'clerk@example.org',
            name: 'Clerk',
            realm: 'greece',
            invitedBy: 'Viewer',
            grant: { role: 'records', scopeName: 'Athens', path: '/athens' },
            pending: true,
        });
        expect(result).toMatchObject({ status: 'pending', inviteEmailSent: true });
    });

    it('names the city of a body in the invite, and sends the reader to the meetings of the city', async () => {
        signIn([cityGrant('athens')]);
        await inviteGrant({ ...invite, scope: { administrativeBodyId: 'youth' } });
        expect(mockSendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
            grant: { role: 'records', scopeName: 'Youth, Athens', path: '/athens/meetings' },
        }));
    });

    it('keeps the grant and reports it when the invite email fails', async () => {
        signIn([cityGrant('athens')]);
        mockSendInviteEmail.mockResolvedValue(false);
        const result = await inviteGrant(invite);
        expect(db.administers.create).toHaveBeenCalled();
        expect(result.inviteEmailSent).toBe(false);
    });

    it('gives an account that signed in before the row at once, with a notice', async () => {
        signIn([cityGrant('athens')]);
        account('existing');
        const result = await inviteGrant(invite);
        expect(db.user.create).not.toHaveBeenCalled();
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'existing', acceptedAt: expect.any(Date) }) }));
        expect(mockSendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'clerk@example.org', pending: false }));
        expect(result).toMatchObject({ status: 'active', inviteEmailSent: true });
    });

    it('keeps the row pending for an account that never signed in', async () => {
        signIn([cityGrant('athens')]);
        account('existing', false);
        const result = await inviteGrant(invite);
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'existing', acceptedAt: null }) }));
        expect(mockSendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ pending: true }));
        expect(result.status).toBe('pending');
    });

    it('supersedes a pending row on the same role and scope: that is a resend', async () => {
        signIn([cityGrant('athens')]);
        account('existing', false);
        db.administers.findFirst.mockResolvedValue({ id: 'stale', acceptedAt: null });
        await inviteGrant(invite);
        expect(db.administers.update).toHaveBeenCalledWith({ where: { id: 'stale' }, data: { revokedAt: expect.any(Date), revokedById: 'viewer' } });
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'existing', acceptedAt: null }) }));
        expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    });
});

describe('revokeGrant', () => {
    const youthAdmin = row({ administrativeBodyId: 'youth' });

    it('answers not found for a missing row, a revoked row, and a machine account', async () => {
        signIn([], true);
        db.administers.findUnique.mockResolvedValue(null);
        await expect(revokeGrant('g1')).rejects.toThrow(NotFoundError);
        db.administers.findUnique.mockResolvedValue(row({ cityId: 'athens', revokedAt: new Date() }));
        await expect(revokeGrant('g1')).rejects.toThrow(NotFoundError);
        db.administers.findUnique.mockResolvedValue(row({ cityId: 'athens', user: { isMachine: true } }));
        await expect(revokeGrant('g1')).rejects.toThrow(NotFoundError);
        expect(db.administers.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a viewer who may not grant on the scope', async () => {
        signIn([cityGrant('argos')]);
        db.administers.findUnique.mockResolvedValue(youthAdmin);
        await expect(revokeGrant('g1')).rejects.toThrow(ForbiddenError);
        expect(db.administers.updateMany).not.toHaveBeenCalled();
    });

    // canGrant, not resolve: a realm admin holds `admin` on the realm, but a
    // realm grant is a superadmin's to give and to take back.
    it('refuses a realm admin the revoke of a peer realm admin, even when another admin remains', async () => {
        signIn([realmGrant('greece')]);
        db.administers.findUnique.mockResolvedValue(row({ id: 'g-peer', realm: 'greece' }));
        db.administers.count.mockResolvedValue(1);
        await expect(revokeGrant('g-peer')).rejects.toThrow(ForbiddenError);
        expect(db.administers.updateMany).not.toHaveBeenCalled();
    });

    it('keeps a claimed row, even for a superadmin', async () => {
        signIn([], true);
        db.administers.findUnique.mockResolvedValue(row({ personId: 'p1', claimedAt: new Date() }));
        db.person.findUnique.mockResolvedValue({ cityId: 'athens', city: CITIES.athens, roles: [] });
        await code(revokeGrant('g1'), 'claimed');
        expect(db.administers.updateMany).not.toHaveBeenCalled();
    });

    it('lets a body admin revoke a colleague but not the last admin of their body', async () => {
        signIn([bodyGrant('youth', 'athens')]);
        db.administers.findUnique.mockResolvedValue(youthAdmin);

        db.administers.count.mockResolvedValue(1);
        await revokeGrant('g1');
        expect(db.administers.count).toHaveBeenCalledWith({
            where: { administrativeBodyId: 'youth', acceptedAt: { not: null }, revokedAt: null, role: 'admin', id: { not: 'g1' }, user: { isMachine: false } },
        });
        expect(db.administers.updateMany).toHaveBeenCalledWith({
            where: { id: 'g1', revokedAt: null, claimedAt: null },
            data: { revokedAt: expect.any(Date), revokedById: 'viewer' },
        });

        db.administers.updateMany.mockClear();
        db.administers.count.mockResolvedValue(0);
        await code(revokeGrant('g1'), 'last-admin');
        expect(db.administers.updateMany).not.toHaveBeenCalled();
    });

    it('lets a body admin revoke the last records grant: only the last admin is kept', async () => {
        signIn([bodyGrant('youth', 'athens')]);
        db.administers.findUnique.mockResolvedValue(row({ administrativeBodyId: 'youth', role: 'records' }));
        await revokeGrant('g1');
        expect(db.administers.count).not.toHaveBeenCalled();
        expect(db.administers.updateMany).toHaveBeenCalled();
    });

    it.each([
        ['a city admin', [cityGrant('athens')], false],
        ['a realm admin', [realmGrant('greece')], false],
        ['a superadmin', [], true],
    ])('lets %s revoke the last admin of a body', async (_, grants, isSuperAdmin) => {
        signIn(grants, isSuperAdmin);
        db.administers.findUnique.mockResolvedValue(youthAdmin);
        db.administers.count.mockResolvedValue(0);
        await revokeGrant('g1');
        expect(db.administers.updateMany).toHaveBeenCalled();
    });

    it('keeps the last admin of a city from a city admin, and lets a realm admin take it', async () => {
        const athensAdmin = row({ cityId: 'athens' });
        db.administers.findUnique.mockResolvedValue(athensAdmin);
        db.administers.count.mockResolvedValue(0);

        signIn([cityGrant('athens')]);
        await code(revokeGrant('g1'), 'last-admin');

        signIn([realmGrant('greece')]);
        await revokeGrant('g1');
        expect(db.administers.updateMany).toHaveBeenCalledTimes(1);
    });

    it('answers not found when another revoke took the row first', async () => {
        signIn([], true);
        db.administers.findUnique.mockResolvedValue(youthAdmin);
        db.administers.updateMany.mockResolvedValue({ count: 0 });
        await expect(revokeGrant('g1')).rejects.toThrow(NotFoundError);
    });

    it('keeps a row that the person claims while the revoke runs', async () => {
        signIn([], true);
        db.administers.findUnique
            .mockResolvedValueOnce(row({ cityId: 'athens', role: 'records' }))
            .mockResolvedValueOnce({ claimedAt: new Date(), revokedAt: null });
        db.administers.updateMany.mockResolvedValue({ count: 0 });
        await code(revokeGrant('g1'), 'claimed');
    });
});

describe('listGrants', () => {
    const rows = [
        row({ id: 'revoked', cityId: 'athens', revokedAt: new Date('2026-03-01'), createdAt: new Date('2026-03-01') }),
        row({ id: 'newer', cityId: 'athens', createdAt: new Date('2026-02-01') }),
        row({ id: 'older', cityId: 'athens', createdAt: new Date('2026-01-01') }),
    ];
    const greekRows = {
        OR: [
            { realm: { in: ['greece'] } },
            { city: { realm: { in: ['greece'] } } },
            { administrativeBody: { city: { realm: { in: ['greece'] } } } },
            { party: { city: { realm: { in: ['greece'] } } } },
            { person: { city: { realm: { in: ['greece'] } } } },
        ],
    };

    it('refuses with no session', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        await expect(listGrants({ realms: null })).rejects.toThrow(UnauthorizedError);
    });

    it('gives a realm admin of greece the greek rows only, people only, active first', async () => {
        signIn([realmGrant('greece')]);
        db.administers.findMany.mockResolvedValue(rows);

        const result = await listGrants({ realms: ['greece'], includeRevoked: true });

        expect(db.administers.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [{ user: { isMachine: false } }, {}, greekRows, {}] },
        }));
        expect(result.map((grant) => [grant.id, grant.status])).toEqual([['newer', 'active'], ['older', 'active'], ['revoked', 'revoked']]);
    });

    it('leaves the revoked rows out unless asked', async () => {
        signIn([realmGrant('greece')]);
        db.administers.findMany.mockResolvedValue([]);
        await listGrants({ realms: ['greece'] });
        expect(db.administers.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [{ user: { isMachine: false } }, { revokedAt: null }, greekRows, {}] },
        }));
    });

    it('refuses a realm admin of greece the rows of france, and the whole list', async () => {
        signIn([realmGrant('greece')]);
        await expect(listGrants({ realms: ['greece', 'france'] })).rejects.toThrow(ForbiddenError);
        await expect(listGrants({ realms: null })).rejects.toThrow(ForbiddenError);
        expect(db.administers.findMany).not.toHaveBeenCalled();
    });

    it('gives a superadmin everything with no filter', async () => {
        signIn([], true);
        db.administers.findMany.mockResolvedValue([]);
        await listGrants({ realms: null });
        expect(db.administers.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [{ user: { isMachine: false } }, { revokedAt: null }, {}, {}] },
        }));
    });

    it('opens the rows of one city to its admin, and to no other city admin', async () => {
        signIn([cityGrant('athens')]);
        db.administers.findMany.mockResolvedValue([]);
        await listGrants({ realms: null, cityId: 'athens' });
        expect(db.administers.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [{ user: { isMachine: false } }, { revokedAt: null }, {}, {
                OR: [{ cityId: 'athens' }, { administrativeBody: { cityId: 'athens' } }, { party: { cityId: 'athens' } }, { person: { cityId: 'athens' } }],
            }] },
        }));

        await expect(listGrants({ realms: null, cityId: 'argos' })).rejects.toThrow(ForbiddenError);
    });

    it('gives a body admin the rows of the bodies held, and nothing of another city', async () => {
        signIn([bodyGrant('youth', 'athens')]);
        db.administers.findMany.mockResolvedValue([]);
        await listGrants({ realms: null, cityId: 'athens' });
        expect(db.administers.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [{ user: { isMachine: false } }, { revokedAt: null }, {}, { administrativeBodyId: { in: ['youth'] } }] },
        }));

        await expect(listGrants({ realms: null, cityId: 'argos' })).rejects.toThrow(ForbiddenError);
    });

    it('does not open the city to a body viewer', async () => {
        signIn([bodyGrant('youth', 'athens', 'viewer')]);
        await expect(listGrants({ realms: null, cityId: 'athens' })).rejects.toThrow(ForbiddenError);
    });
});

describe('a grant row with no scope', () => {
    it('is a bug, not a grant', async () => {
        signIn([], true);
        db.administers.findUnique.mockResolvedValue(row({}));
        await expect(revokeGrant('g1')).rejects.toThrow('names no scope');
    });
});

// `grant` is the generic fixture; the file keeps it in use for a party scope.
describe('inviteGrant on a party', () => {
    it('lets the admin of the party invite on it', async () => {
        signIn([grant({ partyId: 'p1' })]);
        db.party.findUnique.mockResolvedValue({ cityId: 'athens', city: CITIES.athens });
        await inviteGrant({ email: 'clerk@example.org', role: 'viewer', scope: { partyId: 'p1' } });
        expect(db.administers.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ partyId: 'p1', role: 'viewer' }) }));
    });
});
