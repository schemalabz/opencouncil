/** @jest-environment node */
const findMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { city: { findMany } } }));
// Outside a Next server there is no cache to store in: call the function, and
// keep the arguments that the real createCache gives the cache.
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    unstable_cache: jest.fn((fn: () => Promise<unknown>) => fn),
}));

import { unstable_cache } from 'next/cache';
import { isCityOfRealm } from '../cityRealm';

beforeEach(() => {
    jest.mocked(unstable_cache).mockClear();
    findMany.mockReset().mockImplementation(async ({ where }: { where: { realm: string } }) =>
        [{ id: 'athens', realm: 'greece' }, { id: 'nea_smyrni', realm: 'greece' }, { id: 'paris15', realm: 'france' }, { id: 'lyon', realm: 'france' }]
            .filter((city) => city.realm === where.realm));
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('isCityOfRealm', () => {
    it('answers from the cities of the realm', async () => {
        expect(await isCityOfRealm('athens', 'greece')).toBe(true);
        expect(await isCityOfRealm('nea_smyrni', 'greece')).toBe(true);
        expect(await isCityOfRealm('paris15', 'france')).toBe(true);
        expect(await isCityOfRealm('lyon', 'greece')).toBe(false);
        expect(await isCityOfRealm('etc', 'greece')).toBe(false);
        expect(findMany).toHaveBeenCalledWith({ where: { realm: 'greece' }, select: { id: true } });
    });

    it.each(['HEAD', '.env', '%2eenv', '_profiler', '15paris', 'Dockerfile', ''])('rejects %s with no read', async (id) => {
        expect(await isCityOfRealm(id, 'greece')).toBe(false);
        expect(unstable_cache).not.toHaveBeenCalled();
    });

    // One entry per realm: a key without the realm would give every realm the
    // list of the first realm that filled it.
    it('caches the ids of each realm under its own key, with the cities:all tag and no time limit', async () => {
        await isCityOfRealm('lyon', 'france');

        expect(unstable_cache).toHaveBeenCalledTimes(1);
        const [, keyParts, options] = jest.mocked(unstable_cache).mock.calls[0];
        expect(keyParts).toEqual(['cities', 'ids', 'france']);
        expect(options).toEqual({ tags: ['cities:all', 'realm:france:cities:all'] });
    });

    // The proxy decides what a failure means (it lets the request continue);
    // a layout turns it into an error page.
    it('lets a failed read through to the caller', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        findMany.mockRejectedValue(new Error('database down'));

        await expect(isCityOfRealm('athens', 'greece')).rejects.toThrow('database down');
    });
});
