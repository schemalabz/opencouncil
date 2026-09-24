/** @jest-environment node */
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockPersonFindUnique = jest.fn();
const mockAdministersFindMany = jest.fn();
const mockAdministersFindFirst = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        $transaction: (...args: unknown[]) => mockTransaction(...args),
        person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args) },
        administers: {
            findMany: (...args: unknown[]) => mockAdministersFindMany(...args),
            findFirst: (...args: unknown[]) => mockAdministersFindFirst(...args),
        },
    },
}));

const mockCloseAppConsent = jest.fn();
jest.mock('@/lib/db/personConsent', () => ({ closeAppConsent: (...args: unknown[]) => mockCloseAppConsent(...args) }));

import { claimPerson, getClaimablePersonStatus, getClaimedPersonIds } from '@/lib/db/personClaim';

const tx = {
    person: { findUnique: mockFindUnique },
    administers: { create: mockCreate, update: mockUpdate },
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
};
const claimedAt = new Date('2026-09-16T10:00:00Z');
const person = (administrators: { id: string; userId: string; claimedAt: Date | null }[]) => ({
    cityId: 'chania',
    name: 'Α. Β.',
    city: { name: 'Χανιά' },
    administrators,
});

beforeEach(() => {
    for (const m of [mockFindUnique, mockCreate, mockUpdate, mockTransaction, mockUserFindUnique, mockUserUpdate, mockPersonFindUnique, mockAdministersFindMany, mockAdministersFindFirst, mockCloseAppConsent]) m.mockReset();
    mockUserFindUnique.mockResolvedValue({ name: null });
    // Run the callback against the fake client, as the real $transaction does.
    mockTransaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
});

describe('claimPerson', () => {
    it('claims a person nobody has claimed, and closes a consent an earlier account gave in the app', async () => {
        mockFindUnique.mockResolvedValue(person([]));
        const result = await claimPerson('user-1', 'person-1');
        expect(result).toEqual({ status: 'linked', cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        expect(mockCloseAppConsent).toHaveBeenCalledWith(tx, 'person-1');
        expect(mockCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', personId: 'person-1', claimedAt: expect.any(Date) } });
    });

    it('completes the account: the confirmed name when it has none, and onboarded', async () => {
        mockFindUnique.mockResolvedValue(person([]));
        await claimPerson('user-1', 'person-1');
        expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { onboarded: true, name: 'Α. Β.' } });
    });

    it('keeps the name an account already has', async () => {
        mockFindUnique.mockResolvedValue(person([]));
        mockUserFindUnique.mockResolvedValue({ name: 'Δικό μου όνομα' });
        await claimPerson('user-1', 'person-1');
        expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { onboarded: true } });
    });

    it('leaves the account alone when nothing is claimed', async () => {
        mockFindUnique.mockResolvedValue(person([{ id: 'row-9', userId: 'user-9', claimedAt }]));
        await claimPerson('user-1', 'person-1');
        expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('turns the scanner\'s own delegate row into the claimed row instead of adding one', async () => {
        mockFindUnique.mockResolvedValue(person([{ id: 'row-1', userId: 'user-1', claimedAt: null }]));
        expect(await claimPerson('user-1', 'person-1')).toMatchObject({ status: 'linked' });
        expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { claimedAt: expect.any(Date) } });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('lets a person with a delegate be claimed by their own account', async () => {
        mockFindUnique.mockResolvedValue(person([{ id: 'row-9', userId: 'assistant', claimedAt: null }]));
        expect(await claimPerson('user-1', 'person-1')).toMatchObject({ status: 'linked' });
        expect(mockCreate).toHaveBeenCalled();
    });

    it('refuses when another account has claimed the person', async () => {
        mockFindUnique.mockResolvedValue(person([{ id: 'row-9', userId: 'user-9', claimedAt }]));
        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_linked' });
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('is a no-op for a second scan by the same account', async () => {
        mockFindUnique.mockResolvedValue(person([{ id: 'row-1', userId: 'user-1', claimedAt }]));
        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_yours' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('reports a person that no longer exists', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect(await claimPerson('user-1', 'gone')).toEqual({ status: 'not_found' });
    });

    it('runs serializable and retries once after a serialization failure', async () => {
        // The retry sees the row the concurrent winner claimed.
        mockFindUnique.mockResolvedValue(person([{ id: 'row-9', userId: 'user-9', claimedAt }]));
        mockTransaction
            .mockImplementationOnce(async () => { throw Object.assign(new Error('serialization'), { code: 'P2034' }); })
            .mockImplementationOnce(async (fn: (client: typeof tx) => unknown) => fn(tx));

        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_linked' });
        expect(mockTransaction).toHaveBeenCalledTimes(2);
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it('reads a unique-index refusal by who holds the claim now: another account, or a second submit of this one', async () => {
        const refused = async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); };
        mockTransaction.mockImplementationOnce(refused);
        mockAdministersFindFirst.mockResolvedValue({ userId: 'user-9' });
        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_linked' });
        expect(mockAdministersFindFirst).toHaveBeenCalledWith({
            where: { personId: 'person-1', claimedAt: { not: null } },
            select: { userId: true },
        });
        mockTransaction.mockImplementationOnce(refused);
        mockAdministersFindFirst.mockResolvedValue({ userId: 'user-1' });
        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_yours' });
    });

    it('rethrows any other error', async () => {
        mockTransaction.mockImplementationOnce(async () => { throw new Error('down'); });
        await expect(claimPerson('user-1', 'person-1')).rejects.toThrow('down');
    });
});

describe('getClaimablePersonStatus', () => {
    it('counts only claimed rows: a delegate does not spend the code', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ _count: { administrators: 0 } });
        expect(await getClaimablePersonStatus('person-1')).toBe('claimable');
        expect(mockPersonFindUnique.mock.calls[0][0].select._count.select.administrators).toEqual({ where: { claimedAt: { not: null } } });
        mockPersonFindUnique.mockResolvedValueOnce({ _count: { administrators: 1 } });
        expect(await getClaimablePersonStatus('person-1')).toBe('already_linked');
        mockPersonFindUnique.mockResolvedValueOnce(null);
        expect(await getClaimablePersonStatus('gone')).toBe('not_found');
    });
});

describe('getClaimedPersonIds', () => {
    it('asks for claimed rows of the city only', async () => {
        mockAdministersFindMany.mockResolvedValue([{ personId: 'person-1' }, { personId: null }]);
        expect(await getClaimedPersonIds('chania')).toEqual(new Set(['person-1']));
        expect(mockAdministersFindMany).toHaveBeenCalledWith({
            where: { personId: { not: null }, claimedAt: { not: null }, person: { cityId: 'chania' } },
            select: { personId: true },
        });
    });
});
