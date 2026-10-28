/** @jest-environment node */
// The real guard and the real request context together, with only the
// database mocked: who reaches a city of another realm, and where its links go.
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/db/cities', () => ({ filterCityIdsByRealm: jest.fn() }));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealms: jest.fn() }));

import { filterCityIdsByRealm } from '@/lib/db/cities';
import { getCityRealms } from '@/lib/db/cityRealm';
import { requireRealmCity } from '../realmGuards';
import { cityBaseUrl, mcpRealmStore, requestContext } from '../realm-context';

const access = (superadmin: boolean) => ({ superadmin, cityIds: new Set(['krakow']), bodyIds: new Set<string>() });
const onGr = <T>(superadmin: boolean, fn: () => Promise<T>) =>
    mcpRealmStore.run(requestContext('greece', 'opencouncil.gr', { userId: 'u1' }, { adminAccess: access(superadmin) }), fn);

beforeEach(() => {
    jest.clearAllMocks();
    (filterCityIdsByRealm as jest.Mock).mockResolvedValue([]);
    (getCityRealms as jest.Mock).mockResolvedValue(new Map([['krakow', 'poland']]));
});

it('refuses a city of another realm to its own city admin on this connection', async () => {
    await expect(onGr(false, () => requireRealmCity('krakow'))).rejects.toThrow('Unknown municipality: krakow.');
});

it('lets a superadmin reach it, with links on its own realm\'s domain', async () => {
    const url = await onGr(true, async () => {
        await requireRealmCity('krakow');
        return cityBaseUrl('krakow');
    });
    expect(url).toBe('https://opencouncil.pl');
});
