/** @jest-environment node */

const mockQueryRaw = jest.fn();
const mockCounts = { party: jest.fn(), person: jest.fn(), councilMeeting: jest.fn(), role: jest.fn() };
const mockCreate = jest.fn();
const mockCityUpdate = jest.fn();

const tx = {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    party: { count: mockCounts.party, create: mockCreate },
    person: { count: mockCounts.person, create: mockCreate },
    councilMeeting: { count: mockCounts.councilMeeting },
    role: { count: mockCounts.role, create: mockCreate },
    administrativeBody: { create: mockCreate },
    city: { update: mockCityUpdate },
};
jest.mock('../prisma', () => ({
    __esModule: true,
    default: { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
}));
jest.mock('../cities', () => ({ canUseCityCreator: jest.fn(), getCity: jest.fn() }));

import { populateCity } from '../cityPopulate';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';

const DATA = {
    cityId: 'lyon',
    parties: [],
    administrativeBodies: [{ name: 'Conseil', name_en: 'Council', type: 'council' as const }],
    people: [],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockQueryRaw.mockResolvedValue([{ id: 'lyon' }]);
    for (const count of Object.values(mockCounts)) count.mockResolvedValue(0);
    mockCreate.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: `id-${data.name}`, ...data }));
});

describe('populateCity', () => {
    it('locks the city row before it decides that the city is empty', async () => {
        await populateCity('lyon', DATA);
        expect(mockQueryRaw.mock.calls[0].flat().join(' ')).toMatch(/FOR UPDATE/);
        expect(mockQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(mockCounts.party.mock.invocationCallOrder[0]);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('refuses a city that another call has filled by the time the lock is taken', async () => {
        mockCounts.person.mockResolvedValue(3);
        await expect(populateCity('lyon', DATA)).rejects.toThrow(BadRequestError);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('refuses a city that does not exist', async () => {
        mockQueryRaw.mockResolvedValue([]);
        await expect(populateCity('nope', DATA)).rejects.toThrow(NotFoundError);
    });
});
