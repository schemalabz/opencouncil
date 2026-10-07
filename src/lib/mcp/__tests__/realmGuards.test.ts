/** @jest-environment node */
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { administrativeBody: { findMany: jest.fn() } },
}));
jest.mock('@/lib/db/cities', () => ({ filterCityIdsByRealm: jest.fn() }));
jest.mock('../realm-context', () => ({ currentRealm: () => 'greece' }));

import prisma from '@/lib/db/prisma';
import { requireCityBodies, requireRealmBodies } from '../realmGuards';

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
