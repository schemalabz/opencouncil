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
const mockCityCount = jest.fn();
jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
        city: { count: (...args: unknown[]) => mockCityCount(...args) },
        party: { count: (...args: unknown[]) => mockCounts.party(...args) },
        person: { count: (...args: unknown[]) => mockCounts.person(...args) },
        councilMeeting: { count: (...args: unknown[]) => mockCounts.councilMeeting(...args) },
        role: { count: (...args: unknown[]) => mockCounts.role(...args) },
    },
}));

// A copy is stored under a key named after its source, so a test can tell which copies were deleted.
const mockStoreRemoteImage = jest.fn();
const mockDeleteStoredImage = jest.fn();
const mockStorageProblem = jest.fn((): string | null => null);
jest.mock('@/lib/storedImages', () => {
    class RemoteImageError extends Error {
        constructor(readonly url: string, readonly reason: string) { super(`${url}: ${reason}`); }
    }
    class StoredImageWriteError extends Error {
        constructor(cause: Error) { super(cause.message, { cause }); }
    }
    return {
        RemoteImageError,
        StoredImageWriteError,
        storeRemoteImage: (...args: unknown[]) => mockStoreRemoteImage(...args),
        deleteStoredImages: async (keys: string[]) => { for (const key of keys) mockDeleteStoredImage(key); },
        imageStorageProblem: () => mockStorageProblem(),
    };
});

import { populateCity } from '../cityPopulate';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { RemoteImageError, StoredImageWriteError } from '@/lib/storedImages';

const DATA = {
    cityId: 'lyon',
    parties: [],
    administrativeBodies: [{ name: 'Conseil', name_en: 'Council', type: 'council' as const }],
    people: [],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockCityUpdate.mockReset();
    mockQueryRaw.mockResolvedValue([{ id: 'lyon' }]);
    mockCityCount.mockResolvedValue(1);
    mockStorageProblem.mockReturnValue(null);
    for (const count of Object.values(mockCounts)) count.mockResolvedValue(0);
    mockCreate.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: `id-${data.name}`, ...data }));
    mockStoreRemoteImage.mockImplementation(async (url: string) => ({ url: url.replace('https://img/', 'https://stored/'), key: `key:${url}` }));
});

afterEach(() => jest.restoreAllMocks());

const person = (name: string, image: string | null) => ({ name, name_en: name, name_short: name, name_short_en: name, image, profileUrl: null, roles: [] });
const party = (name: string, logo: string | null) => ({ name, name_en: name, name_short: name, name_short_en: name, colorHex: '#123456', logo });

describe('populateCity', () => {
    it('locks the city row before it decides that the city is empty', async () => {
        await populateCity(DATA);
        expect(mockQueryRaw.mock.calls[0].flat().join(' ')).toMatch(/FOR UPDATE/);
        // The early check counts first; the count that decides comes after the lock.
        expect(mockQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(mockCounts.party.mock.invocationCallOrder.at(-1)!);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('refuses a filled city before it copies any image', async () => {
        mockCounts.person.mockResolvedValue(3);
        await expect(populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg')] })).rejects.toThrow(BadRequestError);
        expect(mockStoreRemoteImage).not.toHaveBeenCalled();
        expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it('refuses a city that another call has filled by the time the lock is taken', async () => {
        mockCounts.person.mockResolvedValueOnce(0).mockResolvedValue(3);
        await expect(populateCity(DATA)).rejects.toThrow(BadRequestError);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('refuses a city that does not exist before it copies any image', async () => {
        mockCityCount.mockResolvedValue(0);
        await expect(populateCity({ ...DATA, cityId: 'nope', people: [person('Ana', 'https://img/ana.jpg')] })).rejects.toThrow(NotFoundError);
        expect(mockStoreRemoteImage).not.toHaveBeenCalled();
        expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it('refuses a city that is deleted by the time the lock is taken', async () => {
        mockQueryRaw.mockResolvedValue([]);
        await expect(populateCity({ ...DATA, cityId: 'nope' })).rejects.toThrow(NotFoundError);
    });

    it('saves no photo for a person whose every role is on a youth council (#829)', async () => {
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
        expect(imageOf('Both')).toBe('https://stored/b.jpg');
        expect(imageOf('No role')).toBe('https://stored/n.jpg');
        expect(mockStoreRemoteImage).not.toHaveBeenCalledWith('https://img/y.jpg', expect.anything());
    });

    const bodyData = (name: string) => mockCreate.mock.calls.map(([arg]) => arg.data).find((data) => data.name === name);

    it('gives each body the default tier of its type, and the notification default of that tier (#829)', async () => {
        await populateCity({ ...DATA, administrativeBodies: [...DATA.administrativeBodies, { name: 'Νέων', name_en: 'Youth', type: 'youthCouncil' as const }] });
        expect(bodyData('Conseil')).toMatchObject({ tier: 'primary', notificationBehavior: 'NOTIFICATIONS_APPROVAL' });
        expect(bodyData('Νέων')).toMatchObject({ tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_DISABLED' });
    });

    it('keeps the tier that the payload states, and the notification default of that tier (#829)', async () => {
        await populateCity({ ...DATA, administrativeBodies: [...DATA.administrativeBodies, { name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA', type: 'council' as const, tier: 'secondary' as const }] });
        expect(bodyData('Ζήρεια Α.Ε.')).toMatchObject({ type: 'council', tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_DISABLED' });
    });
    describe('images from other hosts', () => {
        const dataOf = (name: string) => mockCreate.mock.calls.map(([arg]) => arg.data).find((data) => data.name === name);

        it('saves the stored copy of each photo and logo, by its kind', async () => {
            await populateCity({ ...DATA, parties: [party('Green', 'https://img/green.png')], people: [person('Ana', 'https://img/ana.jpg'), person('Bo', null)] });
            expect(dataOf('Green').logo).toBe('https://stored/green.png');
            expect(dataOf('Ana').image).toBe('https://stored/ana.jpg');
            expect(dataOf('Bo').image).toBeNull();
            expect(mockStoreRemoteImage).toHaveBeenCalledWith('https://img/green.png', 'partyLogo');
            expect(mockStoreRemoteImage).toHaveBeenCalledWith('https://img/ana.jpg', 'personImage');
            expect(mockDeleteStoredImage).not.toHaveBeenCalled();
        });

        it('refuses the call with every image that cannot be copied, saves nothing, and deletes the copies it made', async () => {
            mockStoreRemoteImage.mockImplementation(async (url: string) => {
                if (url.includes('broken')) throw new RemoteImageError(url, 'HTTP 404');
                return { url: url.replace('https://img/', 'https://stored/'), key: `key:${url}` };
            });
            const call = populateCity({ ...DATA, parties: [party('Green', 'https://img/broken-logo.png')], people: [person('Ana', 'https://img/ana.jpg'), person('Bo', 'https://img/broken-bo.jpg')] });
            await expect(call).rejects.toThrow(BadRequestError);
            await expect(call).rejects.toThrow(/logo of Green: https:\/\/img\/broken-logo\.png: HTTP 404.*photo of Bo/);
            expect(mockQueryRaw).not.toHaveBeenCalled();
            expect(mockCreate).not.toHaveBeenCalled();
            expect(mockDeleteStoredImage).toHaveBeenCalledWith('key:https://img/ana.jpg');
        });

        it('deletes the copies when the transaction refuses the city', async () => {
            mockCounts.person.mockResolvedValueOnce(0).mockResolvedValue(3);
            await expect(populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg')] })).rejects.toThrow(BadRequestError);
            expect(mockDeleteStoredImage).toHaveBeenCalledWith('key:https://img/ana.jpg');
        });

        it('deletes the copies of uploads still running when a storage error stops the copy step', async () => {
            let release!: () => void;
            const slow = new Promise<void>(resolve => { release = resolve; });
            mockStoreRemoteImage.mockImplementation(async (url: string) => {
                if (url.includes('down')) throw new StoredImageWriteError(new Error('storage down'));
                if (url.includes('slow')) await slow;
                return { url: url.replace('https://img/', 'https://stored/'), key: `key:${url}` };
            });
            const call = populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg'), person('Slow', 'https://img/slow.jpg'), person('Down', 'https://img/down.jpg')] });
            setTimeout(release, 20);
            await expect(call).rejects.toThrow(/storage refused an image copy \(storage down\)/);
            expect(mockDeleteStoredImage.mock.calls.map(([key]) => key).sort()).toEqual(['key:https://img/ana.jpg', 'key:https://img/slow.jpg']);
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it('copies at most 4 images at once', async () => {
            let running = 0;
            let most = 0;
            mockStoreRemoteImage.mockImplementation(async (url: string) => {
                most = Math.max(most, ++running);
                await new Promise(resolve => setTimeout(resolve, 1));
                running--;
                return { url, key: `key:${url}` };
            });
            await populateCity({ ...DATA, people: Array.from({ length: 10 }, (_, index) => person(`P${index}`, `https://img/${index}.jpg`)) });
            expect(most).toBe(4);
        });

        it('names a storage failure, with the URL problems, instead of an internal error', async () => {
            mockStoreRemoteImage.mockImplementation(async (url: string) => {
                if (url.includes('broken')) throw new RemoteImageError(url, 'the host answered HTTP 404');
                if (url.includes('down')) throw new StoredImageWriteError(new Error('AccessDenied'));
                return { url, key: `key:${url}` };
            });
            const call = populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg'), person('Bo', 'https://img/broken.jpg'), person('Cy', 'https://img/down.jpg')] });
            await expect(call).rejects.toMatchObject({ statusCode: 502 });
            await expect(call).rejects.toThrow(/Our storage refused an image copy \(AccessDenied\); nothing was saved.*photo of Bo: .*HTTP 404/);
            expect(mockDeleteStoredImage).toHaveBeenCalledWith('key:https://img/ana.jpg');
        });

        it('lets an error that is neither a URL nor a storage failure through as it is, after the cleanup', async () => {
            const bug = new TypeError('a bug');
            mockStoreRemoteImage.mockImplementation(async (url: string) => {
                if (url.includes('bug')) throw bug;
                return { url, key: `key:${url}` };
            });
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await expect(populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg'), person('Bug', 'https://img/bug.jpg')] })).rejects.toBe(bug);
            expect(mockDeleteStoredImage).toHaveBeenCalledWith('key:https://img/ana.jpg');
        });

        it('keeps the copies when the write fails after the city got its rows (a lost commit acknowledgement)', async () => {
            const dropped = new Error('Connection terminated unexpectedly');
            mockCityUpdate.mockImplementation(async () => {
                mockCounts.person.mockResolvedValue(1);
                throw dropped;
            });
            jest.spyOn(console, 'error').mockImplementation(() => {});
            await expect(populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg')] })).rejects.toBe(dropped);
            expect(mockDeleteStoredImage).not.toHaveBeenCalled();
        });

        it('deletes the copies when the write fails and the city has no rows', async () => {
            mockCityUpdate.mockRejectedValue(new Error('Connection terminated unexpectedly'));
            await expect(populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg')] })).rejects.toThrow('Connection terminated');
            expect(mockDeleteStoredImage).toHaveBeenCalledWith('key:https://img/ana.jpg');
        });

        it('names a deployment that cannot store copies before it fetches anything', async () => {
            mockStorageProblem.mockReturnValue('this deployment has no storage keys (DO_SPACES_KEY, DO_SPACES_SECRET)');
            const call = populateCity({ ...DATA, people: [person('Ana', 'https://img/ana.jpg')] });
            await expect(call).rejects.toThrow(BadRequestError);
            await expect(call).rejects.toThrow(/no storage keys/);
            expect(mockStoreRemoteImage).not.toHaveBeenCalled();
        });

        it('needs no storage when every image is null or already stored', async () => {
            mockStorageProblem.mockReturnValue('no storage');
            mockStoreRemoteImage.mockResolvedValue({ url: 'https://data.opencouncil.gr/x.jpg', key: null });
            await populateCity({ ...DATA, people: [person('Ana', 'https://data.opencouncil.gr/x.jpg'), person('Bo', null)] });
            expect(dataOf('Ana').image).toBe('https://data.opencouncil.gr/x.jpg');
        });

        it('deletes nothing for a URL that is already on our storage', async () => {
            mockStoreRemoteImage.mockResolvedValue({ url: 'https://data.opencouncil.gr/x.jpg', key: null });
            mockCounts.person.mockResolvedValueOnce(0).mockResolvedValue(3);
            await expect(populateCity({ ...DATA, people: [person('Ana', 'https://data.opencouncil.gr/x.jpg')] })).rejects.toThrow(BadRequestError);
            expect(mockDeleteStoredImage).not.toHaveBeenCalled();
        });
    });
});
