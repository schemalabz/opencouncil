/** @jest-environment node */
const findMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { city: { findMany } } }));

const cities = [{ id: 'athens', realm: 'greece' }, { id: 'lyon', realm: 'france' }];

/** A new copy of the module, so that each test starts with no cities in memory. */
function load() {
    let mod!: typeof import('../cityRealm');
    jest.isolateModules(() => {
        mod = require('../cityRealm');
    });
    return mod.isCityOfRealm;
}

beforeEach(() => {
    jest.useFakeTimers();
    findMany.mockReset().mockResolvedValue(cities);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('isCityOfRealm', () => {
    it('answers for the realm of the city', async () => {
        const isCityOfRealm = load();

        expect(await isCityOfRealm('athens', 'greece')).toBe(true);
        expect(await isCityOfRealm('athens', 'france')).toBe(false);
        expect(await isCityOfRealm('lyon', 'france')).toBe(true);
        expect(await isCityOfRealm('etc', 'greece')).toBe(false);
    });

    it('reads the cities one time for a minute of known ids', async () => {
        const isCityOfRealm = load();

        await isCityOfRealm('athens', 'greece');
        jest.advanceTimersByTime(59_000);
        await isCityOfRealm('lyon', 'france');
        expect(findMany).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(2_000);
        await isCityOfRealm('athens', 'greece');
        expect(findMany).toHaveBeenCalledTimes(2);
    });

    it('reads one time for requests that arrive together', async () => {
        const isCityOfRealm = load();

        await Promise.all([isCityOfRealm('athens', 'greece'), isCityOfRealm('etc', 'greece'), isCityOfRealm('lyon', 'france')]);

        expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('reads again for an unknown id at most one time each five seconds', async () => {
        const isCityOfRealm = load();

        await isCityOfRealm('athens', 'greece');
        for (const id of ['etc', 'actuator', 'login']) await isCityOfRealm(id, 'greece');
        expect(findMany).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(6_000);
        for (const id of ['etc', 'actuator', 'login']) await isCityOfRealm(id, 'greece');
        expect(findMany).toHaveBeenCalledTimes(2);
    });

    it('finds a new city after five seconds', async () => {
        const isCityOfRealm = load();

        expect(await isCityOfRealm('patras', 'greece')).toBe(false);
        findMany.mockResolvedValue([...cities, { id: 'patras', realm: 'greece' }]);
        jest.advanceTimersByTime(6_000);

        expect(await isCityOfRealm('patras', 'greece')).toBe(true);
    });

    it('lets the request continue when the first read fails', async () => {
        findMany.mockRejectedValue(new Error('no connection'));
        const isCityOfRealm = load();

        expect(await isCityOfRealm('etc', 'greece')).toBe(true);
    });

    it('answers from the old copy when a later read fails', async () => {
        const isCityOfRealm = load();
        await isCityOfRealm('athens', 'greece');
        findMany.mockRejectedValue(new Error('no connection'));
        jest.advanceTimersByTime(61_000);

        expect(await isCityOfRealm('athens', 'greece')).toBe(true);
        expect(await isCityOfRealm('etc', 'greece')).toBe(false);
    });
});
