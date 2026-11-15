/** @jest-environment node */
// The body routes revalidate the city-list tags by their literal names. This
// test ties those tags to the cache entry of the secondary body ids that search
// reads, so a change of either side cannot leave search on a stale list.
const cacheCalls: { keyParts: string[]; options?: { tags?: string[] } }[] = [];
jest.mock('next/cache', () => ({
    unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options?: { tags?: string[] }) => {
        cacheCalls.push({ keyParts, options });
        return fn;
    },
    revalidateTag: jest.fn(),
}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { administrativeBody: { findMany: jest.fn().mockResolvedValue([{ id: 'youth-1' }]) } },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn() }));

import prisma from '@/lib/db/prisma';
import { getSecondaryBodyIdsCached } from '@/lib/db/administrativeBodies';
import { cityListTags } from '@/lib/db/cityListing';

describe('getSecondaryBodyIdsCached (#829)', () => {
    it('reads the stored tier of the realm, and caches under the city-list tags that a tier change revalidates', async () => {
        expect(await getSecondaryBodyIdsCached('greece')).toEqual(['youth-1']);
        expect(prisma.administrativeBody.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { tier: 'secondary', city: { realm: 'greece' } },
        }));
        const entry = cacheCalls.find(call => call.keyParts.includes('secondary'));
        expect(entry?.options?.tags).toEqual(expect.arrayContaining(cityListTags('greece')));
    });
});
