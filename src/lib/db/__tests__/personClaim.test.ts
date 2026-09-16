/** @jest-environment node */
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockTransaction = jest.fn();
const mockPersonFindUnique = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        $transaction: (...args: unknown[]) => mockTransaction(...args),
        person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args) },
    },
}));

import { claimPerson, getClaimablePersonStatus } from '../personClaim';

const tx = { person: { findUnique: mockFindUnique }, administers: { create: mockCreate } };

beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreate.mockReset();
    mockTransaction.mockReset();
    // Run the callback against the fake client, as the real $transaction does.
    mockTransaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
});

describe('claimPerson', () => {
    it('links a person nobody administers yet', async () => {
        mockFindUnique.mockResolvedValue({ cityId: 'chania', name: 'Α. Β.', administrators: [] });
        const result = await claimPerson('user-1', 'person-1');
        expect(result).toEqual({ status: 'linked', cityId: 'chania', personName: 'Α. Β.' });
        expect(mockCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', personId: 'person-1' } });
    });

    it('refuses when another user already administers the person', async () => {
        mockFindUnique.mockResolvedValue({ cityId: 'chania', name: 'Α. Β.', administrators: [{ userId: 'user-9' }] });
        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_linked' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('is a no-op for a second scan by the same user', async () => {
        mockFindUnique.mockResolvedValue({ cityId: 'chania', name: 'Α. Β.', administrators: [{ userId: 'user-1' }] });
        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_yours' });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('reports a person that no longer exists', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect(await claimPerson('user-1', 'gone')).toEqual({ status: 'not_found' });
    });

    it('runs serializable and retries once after a serialization failure', async () => {
        // The retry sees the row the concurrent winner inserted.
        mockFindUnique.mockResolvedValue({ cityId: 'chania', name: 'Α. Β.', administrators: [{ userId: 'user-9' }] });
        mockTransaction
            .mockImplementationOnce(async () => { throw Object.assign(new Error('serialization'), { code: 'P2034' }); })
            .mockImplementationOnce(async (fn: (client: typeof tx) => unknown) => fn(tx));

        expect(await claimPerson('user-1', 'person-1')).toEqual({ status: 'already_linked' });
        expect(mockTransaction).toHaveBeenCalledTimes(2);
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it('rethrows any other error', async () => {
        mockTransaction.mockImplementationOnce(async () => { throw new Error('down'); });
        await expect(claimPerson('user-1', 'person-1')).rejects.toThrow('down');
    });
});

describe('getClaimablePersonStatus', () => {
    it('tells a person nobody administers from a claimed one and a missing one', async () => {
        mockPersonFindUnique.mockResolvedValueOnce({ _count: { administrators: 0 } });
        expect(await getClaimablePersonStatus('person-1')).toBe('claimable');
        mockPersonFindUnique.mockResolvedValueOnce({ _count: { administrators: 1 } });
        expect(await getClaimablePersonStatus('person-1')).toBe('already_linked');
        mockPersonFindUnique.mockResolvedValueOnce(null);
        expect(await getClaimablePersonStatus('gone')).toBe('not_found');
    });
});
