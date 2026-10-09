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
        await populateCity(DATA);
        expect(mockQueryRaw.mock.calls[0].flat().join(' ')).toMatch(/FOR UPDATE/);
        expect(mockQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(mockCounts.party.mock.invocationCallOrder[0]);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('refuses a city that another call has filled by the time the lock is taken', async () => {
        mockCounts.person.mockResolvedValue(3);
        await expect(populateCity(DATA)).rejects.toThrow(BadRequestError);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('refuses a city that does not exist', async () => {
        mockQueryRaw.mockResolvedValue([]);
        await expect(populateCity({ ...DATA, cityId: 'nope' })).rejects.toThrow(NotFoundError);
    });

    it('saves no photo for a person whose every role is on a secondary body (#829)', async () => {
        const youthRole = { type: 'adminBody' as const, administrativeBodyName: 'Νέων', name: 'Μέλος', name_en: 'Member', isHead: false, startDate: null, endDate: null };
        const councilRole = { ...youthRole, administrativeBodyName: 'Conseil' };
        await populateCity({
            ...DATA,
            administrativeBodies: [...DATA.administrativeBodies, { name: 'Νέων', name_en: 'Youth', type: 'youthCouncil' as const }],
            people: [
                { name: 'Youth only', name_en: 'Youth only', name_short: 'Y', name_short_en: 'Y', image: 'https://img/y.jpg', profileUrl: null, roles: [youthRole] },
                { name: 'Both', name_en: 'Both', name_short: 'B', name_short_en: 'B', image: 'https://img/b.jpg', profileUrl: null, roles: [youthRole, councilRole] },
                { name: 'No role', name_en: 'No role', name_short: 'N', name_short_en: 'N', image: 'https://img/n.jpg', profileUrl: null, roles: [] },
            ],
        });
        const imageOf = (name: string) => mockCreate.mock.calls.map(([arg]) => arg.data).find((data) => data.name === name)?.image;
        expect(imageOf('Youth only')).toBeNull();
        expect(imageOf('Both')).toBe('https://img/b.jpg');
        expect(imageOf('No role')).toBe('https://img/n.jpg');
    });
});
