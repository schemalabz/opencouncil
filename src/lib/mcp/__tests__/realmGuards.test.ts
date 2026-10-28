/** @jest-environment node */
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { administrativeBody: { findMany: jest.fn() } },
}));
jest.mock('@/lib/db/cities', () => ({ filterCityIdsByRealm: jest.fn() }));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealms: jest.fn() }));
const mockReachesEveryRealm = jest.fn(() => false);
const mockRememberCityRealm = jest.fn();
jest.mock('../realm-context', () => ({
    currentRealm: () => 'greece',
    reachesEveryRealm: () => mockReachesEveryRealm(),
    rememberCityRealm: (...args: unknown[]) => mockRememberCityRealm(...args),
}));

import prisma from '@/lib/db/prisma';
import { filterCityIdsByRealm } from '@/lib/db/cities';
import { getCityRealms } from '@/lib/db/cityRealm';
import { assertCitiesInRealm, requireCityBodies, requireRealmBodies, requireRealmCity } from '../realmGuards';

const findManyMock = prisma.administrativeBody.findMany as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('requireRealmBodies', () => {
    // search spans every municipality, so a body id is checked against the
    // realm, not one city. A body of another realm must fail like an unknown id.
    it('looks the ids up inside the realm only', async () => {
        findManyMock.mockResolvedValue([{ id: 'b1' }]);

        await requireRealmBodies(['b1']);

        expect(findManyMock).toHaveBeenCalledWith({
            where: { city: { realm: 'greece' }, id: { in: ['b1'] } },
            select: { id: true },
        });
    });

    it('names every id it did not find', async () => {
        findManyMock.mockResolvedValue([{ id: 'b1' }]);

        await expect(requireRealmBodies(['b1', 'b2', 'b3'])).rejects.toThrow(
            'Unknown administrative body: b2, b3. See get_city.'
        );
    });
});

describe('requireRealmBodies with cityIds', () => {
    // A body of another municipality than the ones the caller filters by
    // would make the search match nothing, which reads as "no subjects".
    it('looks the ids up inside the named municipalities', async () => {
        findManyMock.mockResolvedValue([]);

        await expect(requireRealmBodies(['b1'], ['athens', 'chania'])).rejects.toThrow(
            'Unknown administrative body for athens, chania: b1. See get_city.'
        );
        expect(findManyMock).toHaveBeenCalledWith({
            where: { cityId: { in: ['athens', 'chania'] }, id: { in: ['b1'] } },
            select: { id: true },
        });
    });
});

describe('requireCityBodies', () => {
    it('looks the ids up inside the one city and names it in the error', async () => {
        findManyMock.mockResolvedValue([]);

        await expect(requireCityBodies('athens', ['b9'])).rejects.toThrow(
            'Unknown administrative body for athens: b9. See get_city.'
        );
        expect(findManyMock).toHaveBeenCalledWith({
            where: { cityId: 'athens', id: { in: ['b9'] } },
            select: { id: true },
        });
    });
});

describe('assertCitiesInRealm (lists and searches: one realm)', () => {
    beforeEach(() => mockReachesEveryRealm.mockReturnValue(false));

    it('lets a caller reach only the cities of the request realm', async () => {
        (filterCityIdsByRealm as jest.Mock).mockResolvedValue(['athens']);

        await expect(assertCitiesInRealm(['athens', 'krakow'])).rejects.toThrow('Unknown municipality: krakow.');
        expect(filterCityIdsByRealm).toHaveBeenCalledWith(['athens', 'krakow'], 'greece');
    });

    // A search runs in the connection's realm, so a city of another realm would
    // match nothing; a superadmin is told where the city is instead.
    it('stays in the request realm for a superadmin too, and names the realm of the city', async () => {
        mockReachesEveryRealm.mockReturnValue(true);
        (filterCityIdsByRealm as jest.Mock).mockResolvedValue(['athens']);
        (getCityRealms as jest.Mock).mockResolvedValue(new Map([['krakow', 'poland']]));

        await expect(assertCitiesInRealm(['athens', 'krakow'])).rejects.toThrow(
            'Not in the greece realm of this connection: krakow (poland).'
        );
    });
});

describe('requireRealmCity (one city by id)', () => {
    beforeEach(() => mockReachesEveryRealm.mockReturnValue(false));

    it('keeps a reader or a city admin in the request realm', async () => {
        (filterCityIdsByRealm as jest.Mock).mockResolvedValue([]);

        await expect(requireRealmCity('krakow')).rejects.toThrow('Unknown municipality: krakow.');
        expect(getCityRealms).not.toHaveBeenCalled();
    });

    it('returns the request realm for a city of that realm', async () => {
        (filterCityIdsByRealm as jest.Mock).mockResolvedValue(['athens']);

        await expect(requireRealmCity('athens')).resolves.toBe('greece');
        expect(getCityRealms).not.toHaveBeenCalled();
    });

    // A superadmin adds and runs the cities of every realm from one connection.
    it('lets a superadmin reach a city of any realm, and records its realm for links', async () => {
        mockReachesEveryRealm.mockReturnValue(true);
        (getCityRealms as jest.Mock).mockResolvedValue(new Map([['krakow', 'poland']]));

        await expect(requireRealmCity('krakow')).resolves.toBe('poland');
        expect(mockRememberCityRealm).toHaveBeenCalledWith('krakow', 'poland');
        expect(filterCityIdsByRealm).not.toHaveBeenCalled();
    });

    it('still refuses a city that does not exist, for a superadmin', async () => {
        mockReachesEveryRealm.mockReturnValue(true);
        (getCityRealms as jest.Mock).mockResolvedValue(new Map());

        await expect(requireRealmCity('atlantis')).rejects.toThrow('Unknown municipality: atlantis.');
    });
});
