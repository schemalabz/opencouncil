/** @jest-environment node */
jest.mock('@/lib/search/core', () => ({ searchInRealm: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({ getCities: jest.fn() }));
jest.mock('@/lib/db/citiesAdmin', () => ({ listCitiesWithCounts: jest.fn() }));

import { getCities } from '@/lib/db/cities';
import { listCitiesWithCounts } from '@/lib/db/citiesAdmin';
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';
import { mcpListCities } from '../data';
import { mcpRealmStore, requestContext } from '../realm-context';

const city = (id: string, status: string, language: string) => ({
    id, name: id, name_en: id, name_municipality: id, authorityType: 'municipality', status, language,
    _count: { councilMeetings: 0, persons: 0, parties: 0 },
});
const SUPERADMIN = { superadmin: true, cityIds: new Set<string>(), bodyIds: new Set<string>() };
const CITY_ADMIN = { superadmin: false, cityIds: new Set(['athens']), bodyIds: new Set<string>() };
const USER = { userId: 'u1' };

const onGr = <T>(fn: () => Promise<T>, adminAccess: typeof SUPERADMIN | null = null, identity: typeof USER | null = USER) =>
    mcpRealmStore.run(requestContext('greece', 'opencouncil.gr', identity, { adminAccess }), fn);

beforeEach(() => jest.clearAllMocks());

describe('list_cities', () => {
    it('lists the public cities of the connection\'s realm, as before', async () => {
        (getCities as jest.Mock).mockResolvedValue([city('athens', 'supported', 'el')]);

        const result = await onGr(() => mcpListCities(null, {}), null, null);

        expect(getCities).toHaveBeenCalledWith({}, 'greece');
        expect(result).not.toHaveProperty('realm');
        expect(result.cities[0]).not.toHaveProperty('status');
        expect(result.cities[0].url).toBe('https://opencouncil.gr/athens');
    });

    it('refuses another realm or the pending cities to anyone but a superadmin', async () => {
        await expect(onGr(() => mcpListCities(null, { realm: 'poland' }), null, null)).rejects.toThrow(UnauthorizedError);
        await expect(onGr(() => mcpListCities(USER, { includePending: true }), CITY_ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listCitiesWithCounts).not.toHaveBeenCalled();
    });

    // Adding a city starts by checking that it does not exist, pending ones included.
    it('lists every city of another realm for a superadmin, with status, language and links on that realm\'s domain', async () => {
        (listCitiesWithCounts as jest.Mock).mockResolvedValue([city('krakow', 'pending', 'pl')]);

        const result = await onGr(() => mcpListCities(USER, { realm: 'poland', includePending: true }), SUPERADMIN);

        expect(listCitiesWithCounts).toHaveBeenCalledWith({ realm: 'poland' });
        expect(result.realm).toBe('poland');
        expect(result.cities[0]).toMatchObject({ id: 'krakow', status: 'pending', language: 'pl', url: 'https://opencouncil.pl/krakow' });
    });
});
