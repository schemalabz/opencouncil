/** @jest-environment node */
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockTransaction = jest.fn();
const mockClaimant = jest.fn();
const txFindFirst = jest.fn();
const txCreate = jest.fn();
const txUpdate = jest.fn();
const txClaimed = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        voicePrintConsent: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
        },
        administers: { findFirst: (...args: unknown[]) => mockClaimant(...args) },
        $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
}));
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

import {
    setVoicePrintConsent,
    recordVoicePrintConsent,
    getVoicePrintConsents,
    getVoicePrintConsentStatus,
} from '../personConsent';

const tx = {
    voicePrintConsent: { findFirst: txFindFirst, create: txCreate, update: txUpdate },
    administers: { findFirst: txClaimed },
};
const claimedAt = new Date('2026-09-16T10:00:00Z');
const claimant = { id: 'user-1', isSuperAdmin: false, administers: [{ personId: 'person-1', claimedAt }] };
const superadmin = { id: 'admin-1', isSuperAdmin: true, administers: [] };
const open = (source: 'PERSON' | 'ADMIN', userId: string | null = 'user-1', givenAt = claimedAt) => ({ id: 'consent-1', userId, source, givenAt });
const closed = { where: { id: 'consent-1' }, data: { withdrawnAt: expect.any(Date) } };

beforeEach(() => {
    for (const m of [mockFindMany, mockFindFirst, mockTransaction, mockClaimant, txFindFirst, txCreate, txUpdate, txClaimed, mockGetCurrentUser]) m.mockReset();
    mockTransaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    txClaimed.mockResolvedValue({ id: 'row-1', userId: 'user-1' });
    txFindFirst.mockResolvedValue(null);
});

describe('setVoicePrintConsent', () => {
    it('opens a period under the account that claimed the person', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        await setVoicePrintConsent('person-1', true);
        expect(txCreate).toHaveBeenCalledWith({ data: { personId: 'person-1', userId: 'user-1' } });
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it('keeps its own open period on a repeat tick, so the original time stands', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await setVoicePrintConsent('person-1', true);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it("closes a stale period of another account and opens this account's own", async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue(open('PERSON', 'old-account'));
        await setVoicePrintConsent('person-1', true);
        expect(txUpdate).toHaveBeenCalledWith(closed);
        expect(txCreate).toHaveBeenCalledWith({ data: { personId: 'person-1', userId: 'user-1' } });
    });

    it('closes the open period on withdrawal and deletes nothing', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await setVoicePrintConsent('person-1', false);
        expect(txUpdate).toHaveBeenCalledWith(closed);
        expect(txCreate).not.toHaveBeenCalled();
    });

    it('closes a period at its grant time when the clock of this instance is behind', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        const ahead = new Date(Date.now() + 60_000);
        txFindFirst.mockResolvedValue(open('PERSON', 'user-1', ahead));
        await setVoicePrintConsent('person-1', false);
        expect(txUpdate).toHaveBeenCalledWith({ where: { id: 'consent-1' }, data: { withdrawnAt: ahead } });
    });

    it('cannot withdraw a consent that a superadmin recorded, and a tick on it changes nothing', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue(open('ADMIN', 'admin-1'));
        await expect(setVoicePrintConsent('person-1', false)).rejects.toThrow(/by email/);
        await setVoicePrintConsent('person-1', true);
        expect(txUpdate).not.toHaveBeenCalled();
        expect(txCreate).not.toHaveBeenCalled();
    });

    it('treats a lost race between two ticks as success', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        mockTransaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
        await expect(setVoicePrintConsent('person-1', true)).resolves.toBeUndefined();
    });

    it('treats the same lost race on the retry as success too', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        mockTransaction
            .mockRejectedValueOnce(Object.assign(new Error('serialization'), { code: 'P2034' }))
            .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
        await expect(setVoicePrintConsent('person-1', true)).resolves.toBeUndefined();
        expect(mockTransaction).toHaveBeenCalledTimes(2);
    });

    it('checks the claim inside the write: a claim removed meanwhile refuses it', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txClaimed.mockResolvedValue(null);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/claimed the person/);
        await expect(setVoicePrintConsent('person-1', false)).rejects.toThrow(/claimed the person/);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdate).not.toHaveBeenCalled();
        expect(txClaimed).toHaveBeenCalledWith({
            where: { userId: 'user-1', personId: 'person-1', claimedAt: { not: null } },
            select: { id: true },
        });
    });

    it('runs serializable, and retries once when a grant and a withdrawal collide', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue(open('PERSON'));
        mockTransaction.mockImplementationOnce(async () => { throw Object.assign(new Error('serialization'), { code: 'P2034' }); });
        await setVoicePrintConsent('person-1', false);
        expect(mockTransaction).toHaveBeenCalledTimes(2);
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
        expect(txUpdate).toHaveBeenCalledTimes(1);
    });

    it('refuses a delegate link: only the claimed account is the person', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'assistant', isSuperAdmin: false, administers: [{ personId: 'person-1', claimedAt: null }] });
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/claimed the person/);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("refuses a superadmin who did not claim the person: this box is the person's own", async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/claimed the person/);
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
    it('opens an ADMIN period under the superadmin, for a person with no account', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        await recordVoicePrintConsent('person-1', true);
        expect(txCreate).toHaveBeenCalledWith({ data: { personId: 'person-1', userId: 'admin-1', source: 'ADMIN' } });
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it("keeps a period in force as it is: the claimant's own, or a recorded one", async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await recordVoicePrintConsent('person-1', true);
        txFindFirst.mockResolvedValue(open('ADMIN', null));
        await recordVoicePrintConsent('person-1', true);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdate).not.toHaveBeenCalled();
    });

    it('replaces a stale period, of a previous or a deleted account, with a recorded one', async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        for (const stale of [open('PERSON', 'old-account'), open('PERSON', null)]) {
            txUpdate.mockClear();
            txCreate.mockClear();
            txFindFirst.mockResolvedValue(stale);
            await recordVoicePrintConsent('person-1', true);
            expect(txUpdate).toHaveBeenCalledWith(closed);
            expect(txCreate).toHaveBeenCalledWith({ data: { personId: 'person-1', userId: 'admin-1', source: 'ADMIN' } });
        }
        // Nobody has claimed the person: every PERSON period is stale.
        txClaimed.mockResolvedValue(null);
        txCreate.mockClear();
        txFindFirst.mockResolvedValue(open('PERSON'));
        await recordVoicePrintConsent('person-1', true);
        expect(txCreate).toHaveBeenCalled();
    });

    it("withdraws the open period, the person's own included", async () => {
        mockGetCurrentUser.mockResolvedValue(superadmin);
        txFindFirst.mockResolvedValue(open('PERSON'));
        await recordVoicePrintConsent('person-1', false);
        expect(txUpdate).toHaveBeenCalledWith(closed);
    });

    it('refuses anybody who is not a superadmin, the claimed account included', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        await expect(recordVoicePrintConsent('person-1', true)).rejects.toThrow(/superadmin/);
        mockGetCurrentUser.mockResolvedValue(null);
        await expect(recordVoicePrintConsent('person-1', true)).rejects.toThrow(/signed in/);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('refuses a non-boolean', async () => {
        await expect(recordVoicePrintConsent('person-1', 'yes' as unknown as boolean)).rejects.toThrow(/boolean/);
    });
});

describe('getVoicePrintConsents', () => {
    it("returns this account's own periods and the recorded ones, and skips the query for no ids", async () => {
        mockFindMany.mockResolvedValue([{ personId: 'person-2', source: 'ADMIN' }]);
        expect(await getVoicePrintConsents(['person-1', 'person-2'], 'user-1')).toEqual(new Map([['person-2', 'ADMIN']]));
        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                personId: { in: ['person-1', 'person-2'] },
                withdrawnAt: null,
                OR: [{ source: 'PERSON', userId: 'user-1' }, { source: 'ADMIN' }],
            },
            select: { personId: true, source: true },
        });
        expect(await getVoicePrintConsents([], 'user-1')).toEqual(new Map());
        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});

describe('getVoicePrintConsentStatus', () => {
    const period = (source: 'PERSON' | 'ADMIN', userId: string | null) => ({ source, userId, givenAt: claimedAt, user: null });

    it('reads the open period of the person', async () => {
        mockFindFirst.mockResolvedValue(null);
        expect(await getVoicePrintConsentStatus('person-1')).toBeNull();
        expect(mockFindFirst.mock.calls[0][0].where).toEqual({ personId: 'person-1', withdrawnAt: null });
    });

    it('shows what the account of the person sees: not a stale period, always a recorded one', async () => {
        mockClaimant.mockResolvedValue({ userId: 'user-1' });
        mockFindFirst.mockResolvedValue(period('PERSON', 'user-1'));
        expect(await getVoicePrintConsentStatus('person-1')).toMatchObject({ source: 'PERSON' });
        mockFindFirst.mockResolvedValue(period('PERSON', 'old-account'));
        expect(await getVoicePrintConsentStatus('person-1')).toBeNull();
        mockClaimant.mockResolvedValue(null);
        mockFindFirst.mockResolvedValue(period('ADMIN', 'admin-1'));
        expect(await getVoicePrintConsentStatus('person-1')).toMatchObject({ source: 'ADMIN' });
    });
});
