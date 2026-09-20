/** @jest-environment node */
const mockTransaction = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));

import { serializableOnce } from '../serializable';

const failure = (code: string) => Object.assign(new Error(code), { code });
const work = async () => 'done';

beforeEach(() => {
    mockTransaction.mockReset();
});

describe('serializableOnce', () => {
    it('runs the work once, in a serializable transaction', async () => {
        mockTransaction.mockImplementation(async (fn: () => unknown) => fn());
        expect(await serializableOnce(work, () => 'conflict')).toBe('done');
        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockTransaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it('retries once after a serialization failure', async () => {
        mockTransaction.mockRejectedValueOnce(failure('P2034')).mockResolvedValueOnce('done');
        expect(await serializableOnce(work, () => 'conflict')).toBe('done');
        expect(mockTransaction).toHaveBeenCalledTimes(2);
    });

    it('answers a unique conflict with onUniqueConflict, on the first attempt or on the retry', async () => {
        mockTransaction.mockRejectedValueOnce(failure('P2002'));
        expect(await serializableOnce(work, () => 'conflict')).toBe('conflict');
        mockTransaction.mockRejectedValueOnce(failure('P2034')).mockRejectedValueOnce(failure('P2002'));
        expect(await serializableOnce(work, async () => 'conflict')).toBe('conflict');
        expect(mockTransaction).toHaveBeenCalledTimes(3);
    });

    it('does not retry a second serialization failure, nor any other error', async () => {
        mockTransaction.mockRejectedValueOnce(failure('P2034')).mockRejectedValueOnce(failure('P2034'));
        await expect(serializableOnce(work, () => 'conflict')).rejects.toThrow('P2034');
        mockTransaction.mockRejectedValueOnce(new Error('down'));
        await expect(serializableOnce(work, () => 'conflict')).rejects.toThrow('down');
        expect(mockTransaction).toHaveBeenCalledTimes(3);
    });
});
