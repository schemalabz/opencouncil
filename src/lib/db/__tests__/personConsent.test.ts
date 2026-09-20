/** @jest-environment node */
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockTransaction = jest.fn();
const txFindFirst = jest.fn();
const txCreate = jest.fn();
const txUpdate = jest.fn();
const txAdministers = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        voicePrintConsent: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
        },
        $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
}));
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

import {
    setVoicePrintConsent,
    recordVoicePrintConsent,
    closeAppConsent,
    getVoicePrintConsents,
    getVoicePrintConsentStatuses,
} from '../personConsent';

const tx = {
    voicePrintConsent: { findFirst: txFindFirst, create: txCreate, update: txUpdate },
    administers: { findFirst: txAdministers },
};
const claimedAt = new Date('2026-09-16T10:00:00Z');
// The person's own account, by a QR claim.
const owner = { id: 'user-1', isSuperAdmin: false, administers: [{ personId: 'person-1', claimedAt }] };
// An account a superadmin gave the person to, without a claim.
const delegate = { id: 'assistant', isSuperAdmin: false, administers: [{ personId: 'person-1', claimedAt: null }] };
const superadmin = { id: 'admin-1', isSuperAdmin: true, administers: [] };
const open = (source: 'PERSON' | 'ADMIN', givenAt = claimedAt) => ({ id: 'consent-1', source, givenAt });
const closed = { where: { id: 'consent-1' }, data: { withdrawnAt: expect.any(Date) } };
const created = (userId: string, source?: 'ADMIN') => ({ data: { personId: 'person-1', userId, ...(source ? { source } : {}) } });

beforeEach(() => {
    for (const m of [mockFindMany, mockFindFirst, mockTransaction, txFindFirst, txCreate, txUpdate, txAdministers, mockGetCurrentUser]) m.mockReset();
    mockTransaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    txAdministers.mockResolvedValue({ id: 'row-1' });
    txFindFirst.mockResolvedValue(null);
});

describe('setVoicePrintConsent', () => {
    it('opens a period under an account that administers the person', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        await setVoicePrintConsent('person-1', true);
        expect(txCreate).toHaveBeenCalledWith(created('user-1'));
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it('accepts a delegate account too: the consent follows the permission, not the claim', async () => {
        mockGetCurrentUser.mockResolvedValue(delegate);
        await setVoicePrintConsent('person-1', true);
        expect(txCreate).toHaveBeenCalledWith(created('assistant'));
    });

    it('keeps the open period on a repeat tick, whoever opened it, so the original time stands', async () => {
        mockGetCurrentUser.mockResolvedValue(delegate);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await setVoicePrintConsent('person-1', true);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it('closes the open period on withdrawal, whoever opened it, and deletes nothing', async () => {
        mockGetCurrentUser.mockResolvedValue(delegate);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await setVoicePrintConsent('person-1', false);
        expect(txUpdate).toHaveBeenCalledWith(closed);
        expect(txCreate).not.toHaveBeenCalled();
    });

    it('closes a period at its grant time when the clock of this instance is behind', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        const ahead = new Date(Date.now() + 60_000);
        txFindFirst.mockResolvedValue(open('PERSON', ahead));
        await setVoicePrintConsent('person-1', false);
        expect(txUpdate).toHaveBeenCalledWith({ where: { id: 'consent-1' }, data: { withdrawnAt: ahead } });
    });

    it('cannot withdraw a consent that a superadmin recorded, and a tick on it changes nothing', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        txFindFirst.mockResolvedValue(open('ADMIN'));
        await expect(setVoicePrintConsent('person-1', false)).rejects.toThrow(/by email/);
        await setVoicePrintConsent('person-1', true);
        expect(txUpdate).not.toHaveBeenCalled();
        expect(txCreate).not.toHaveBeenCalled();
    });

    it('treats a lost race between two ticks as success', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        mockTransaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
        await expect(setVoicePrintConsent('person-1', true)).resolves.toBeUndefined();
    });

    it('treats the same lost race on the retry as success too', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        mockTransaction
            .mockRejectedValueOnce(Object.assign(new Error('serialization'), { code: 'P2034' }))
            .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
        await expect(setVoicePrintConsent('person-1', true)).resolves.toBeUndefined();
        expect(mockTransaction).toHaveBeenCalledTimes(2);
    });

    it('checks the permission inside the write: a row removed meanwhile refuses it', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        txAdministers.mockResolvedValue(null);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/administers the person/);
        await expect(setVoicePrintConsent('person-1', false)).rejects.toThrow(/administers the person/);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdate).not.toHaveBeenCalled();
        expect(txAdministers).toHaveBeenCalledWith({ where: { userId: 'user-1', personId: 'person-1' }, select: { id: true } });
    });

    it('runs serializable, and retries once when a grant and a withdrawal collide', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        txFindFirst.mockResolvedValue(open('PERSON'));
        mockTransaction.mockImplementationOnce(async () => { throw Object.assign(new Error('serialization'), { code: 'P2034' }); });
        await setVoicePrintConsent('person-1', false);
        expect(mockTransaction).toHaveBeenCalledTimes(2);
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
        expect(txUpdate).toHaveBeenCalledTimes(1);
    });

    it('refuses an account that administers another person only', async () => {
        mockGetCurrentUser.mockResolvedValue({ ...owner, administers: [{ personId: 'person-2', claimedAt }] });
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/administers the person/);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('refuses a superadmin who was not given the person: this box is not theirs', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/administers the person/);
    });

    it('refuses when signed out', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/signed in/);
    });

    it('refuses a non-boolean before touching the session or the database', async () => {
        await expect(setVoicePrintConsent('person-1', undefined as unknown as boolean)).rejects.toThrow(/boolean/);
        expect(mockGetCurrentUser).not.toHaveBeenCalled();
    });
});

describe('recordVoicePrintConsent', () => {
    it('opens an ADMIN period under the superadmin, for a person with no consent', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        await recordVoicePrintConsent('person-1', true);
        expect(txCreate).toHaveBeenCalledWith(created('admin-1', 'ADMIN'));
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it('keeps a recorded period as it is, so the original time stands', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        txFindFirst.mockResolvedValue(open('ADMIN'));
        await recordVoicePrintConsent('person-1', true);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it('replaces a consent given in the app with the recorded one, so the box locks', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await recordVoicePrintConsent('person-1', true);
        expect(txUpdate).toHaveBeenCalledWith(closed);
        expect(txCreate).toHaveBeenCalledWith(created('admin-1', 'ADMIN'));
    });

    it('replaces the period that a concurrent grant opened first, and refuses after a second conflict', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        const conflict = Object.assign(new Error('unique'), { code: 'P2002' });
        mockTransaction.mockRejectedValueOnce(conflict);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await recordVoicePrintConsent('person-1', true);
        expect(txUpdate).toHaveBeenCalledWith(closed);
        expect(txCreate).toHaveBeenCalledWith(created('admin-1', 'ADMIN'));

        mockTransaction.mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict);
        await expect(recordVoicePrintConsent('person-1', true)).rejects.toThrow(/try again/);
    });

    it("withdraws the open period, the person's own included", async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await recordVoicePrintConsent('person-1', false);
        expect(txUpdate).toHaveBeenCalledWith(closed);
    });

    it('refuses anybody who is not a superadmin, the account of the person included', async () => {
        mockGetCurrentUser.mockResolvedValue(owner);
        await expect(recordVoicePrintConsent('person-1', true)).rejects.toThrow(/superadmin/);
        mockGetCurrentUser.mockResolvedValue(null);
        await expect(recordVoicePrintConsent('person-1', true)).rejects.toThrow(/signed in/);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('refuses a non-boolean', async () => {
        await expect(recordVoicePrintConsent('person-1', 'yes' as unknown as boolean)).rejects.toThrow(/boolean/);
        expect(mockGetCurrentUser).not.toHaveBeenCalled();
    });
});

describe('closeAppConsent', () => {
    it('closes the consent given in the app, and only that one', async () => {
        txFindFirst.mockResolvedValue(open('PERSON'));
        await closeAppConsent(tx as never, 'person-1');
        expect(txFindFirst.mock.calls[0][0].where).toEqual({ personId: 'person-1', withdrawnAt: null, source: 'PERSON' });
        expect(txUpdate).toHaveBeenCalledWith(closed);
    });

    it('changes nothing when no consent was given in the app', async () => {
        await closeAppConsent(tx as never, 'person-1');
        expect(txUpdate).not.toHaveBeenCalled();
    });
});

describe('getVoicePrintConsents', () => {
    it('returns the open period of each person, whoever opened it, and skips the query for no ids', async () => {
        mockFindMany.mockResolvedValue([{ personId: 'person-2', source: 'ADMIN' }]);
        expect(await getVoicePrintConsents(['person-1', 'person-2'])).toEqual(new Map([['person-2', 'ADMIN']]));
        expect(mockFindMany).toHaveBeenCalledWith({
            where: { personId: { in: ['person-1', 'person-2'] }, withdrawnAt: null },
            select: { personId: true, source: true },
        });
        expect(await getVoicePrintConsents([])).toEqual(new Map());
        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});

describe('getVoicePrintConsentStatuses', () => {
    it('reads the open period of each person, with the account that gave it, and skips the query for no ids', async () => {
        const status = { personId: 'person-1', source: 'PERSON', userId: 'user-1', givenAt: claimedAt, user: { name: 'Α. Μ.', email: 'a@b.gr' } };
        mockFindMany.mockResolvedValue([status]);
        expect(await getVoicePrintConsentStatuses(['person-1', 'person-2'])).toEqual(new Map([['person-1', status]]));
        expect(mockFindMany.mock.calls[0][0].where).toEqual({ personId: { in: ['person-1', 'person-2'] }, withdrawnAt: null });
        expect(await getVoicePrintConsentStatuses([])).toEqual(new Map());
        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});
