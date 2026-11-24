import { mapSettled } from '../mapSettled';

describe('mapSettled', () => {
    it('keeps the order of the items and settles every call, also after a failure', async () => {
        const results = await mapSettled([3, 1, 2], 2, async (n) => {
            await new Promise(resolve => setTimeout(resolve, n * 5));
            if (n === 1) throw new Error('one');
            return n * 10;
        });
        expect(results).toEqual([
            { status: 'fulfilled', value: 30 },
            { status: 'rejected', reason: new Error('one') },
            { status: 'fulfilled', value: 20 },
        ]);
    });

    it('never runs more than `limit` calls at once', async () => {
        let running = 0;
        let most = 0;
        await mapSettled([1, 2, 3, 4, 5, 6], 2, async () => {
            most = Math.max(most, ++running);
            await new Promise(resolve => setTimeout(resolve, 2));
            running--;
        });
        expect(most).toBe(2);
    });

    it('returns an empty list for no items', async () => {
        await expect(mapSettled([], 4, async () => 1)).resolves.toEqual([]);
    });

    it('refuses a limit below 1, which would run nothing and leave empty results', async () => {
        for (const limit of [0, -1, Number.NaN, 1.5]) {
            await expect(mapSettled([1], limit, async () => 1)).rejects.toThrow(RangeError);
        }
    });
});
