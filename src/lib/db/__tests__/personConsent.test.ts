/** @jest-environment node */
const mockUpdateMany = jest.fn();
const mockFindMany = jest.fn();
const mockTransaction = jest.fn();
const txUpdateMany = jest.fn();
const txFindFirst = jest.fn();
const txCreate = jest.fn();
const txClaimed = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        voicePrintConsent: {
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
        $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
}));
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

import { setVoicePrintConsent, getVoicePrintConsentedIds } from '../personConsent';

const tx = {
    voicePrintConsent: { updateMany: txUpdateMany, findFirst: txFindFirst, create: txCreate },
    administers: { findFirst: txClaimed },
};
const claimedAt = new Date('2026-09-16T10:00:00Z');
const claimant = { id: 'user-1', isSuperAdmin: false, administers: [{ personId: 'person-1', claimedAt }] };

beforeEach(() => {
    for (const m of [mockUpdateMany, mockFindMany, mockTransaction, txUpdateMany, txFindFirst, txCreate, txClaimed, mockGetCurrentUser]) m.mockReset();
    mockTransaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    txClaimed.mockResolvedValue({ id: 'row-1' });
});

describe('setVoicePrintConsent', () => {
    it('opens a period under the account that claimed the person, closing one of another or a deleted account', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue(null);
        await setVoicePrintConsent('person-1', true);
        expect(txUpdateMany).toHaveBeenCalledWith({
            where: { personId: 'person-1', withdrawnAt: null, OR: [{ userId: null }, { userId: { not: 'user-1' } }] },
            data: { withdrawnAt: expect.any(Date) },
        });
        expect(txCreate).toHaveBeenCalledWith({ data: { personId: 'person-1', userId: 'user-1' } });
    });

    it('keeps the open period on a repeat tick, so the original time stands', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txFindFirst.mockResolvedValue({ id: 'consent-1' });
        await setVoicePrintConsent('person-1', true);
        expect(txCreate).not.toHaveBeenCalled();
    });

    it('treats a lost race between two ticks as success', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        mockTransaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
        await expect(setVoicePrintConsent('person-1', true)).resolves.toBeUndefined();
    });

    it('closes the open periods on withdrawal and deletes nothing', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        await setVoicePrintConsent('person-1', false);
        expect(txUpdateMany).toHaveBeenCalledWith({
            where: { personId: 'person-1', withdrawnAt: null },
            data: { withdrawnAt: expect.any(Date) },
        });
        expect(txCreate).not.toHaveBeenCalled();
    });

    it('checks the claim inside the write: a claim removed meanwhile refuses it', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        txClaimed.mockResolvedValue(null);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/claimed the person/);
        await expect(setVoicePrintConsent('person-1', false)).rejects.toThrow(/claimed the person/);
        expect(txCreate).not.toHaveBeenCalled();
        expect(txUpdateMany).not.toHaveBeenCalled();
        expect(txClaimed).toHaveBeenCalledWith({
            where: { userId: 'user-1', personId: 'person-1', claimedAt: { not: null } },
            select: { id: true },
        });
    });

    it('runs serializable, and retries once when a grant and a withdrawal collide', async () => {
        mockGetCurrentUser.mockResolvedValue(claimant);
        mockTransaction.mockImplementationOnce(async () => { throw Object.assign(new Error('serialization'), { code: 'P2034' }); });
        await setVoicePrintConsent('person-1', false);
        expect(mockTransaction).toHaveBeenCalledTimes(2);
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
        expect(txUpdateMany).toHaveBeenCalledTimes(1);
    });

    it('refuses a delegate link: only the claimed account is the person', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'assistant', isSuperAdmin: false, administers: [{ personId: 'person-1', claimedAt: null }] });
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/claimed the person/);
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("refuses a superadmin who did not claim the person: consent is the person's own", async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'admin', isSuperAdmin: true, administers: [] });
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

describe('getVoicePrintConsentedIds', () => {
    it('returns the persons with an open period given by this account, and skips the query for no ids', async () => {
        mockFindMany.mockResolvedValue([{ personId: 'person-2' }]);
        expect(await getVoicePrintConsentedIds(['person-1', 'person-2'], 'user-1')).toEqual(new Set(['person-2']));
        expect(mockFindMany).toHaveBeenCalledWith({
            where: { personId: { in: ['person-1', 'person-2'] }, userId: 'user-1', withdrawnAt: null },
            select: { personId: true },
        });
        expect(await getVoicePrintConsentedIds([], 'user-1')).toEqual(new Set());
        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});
