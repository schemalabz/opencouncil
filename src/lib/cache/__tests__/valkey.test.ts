/** @jest-environment node */
import { cacheIncrWindow, disconnectCache, INCR_WINDOW_DEADLINE_MS } from '../valkey';

const mockConnect = jest.fn();
const mockEval = jest.fn();
const fakeClient = {
    isReady: false,
    on: jest.fn(),
    connect: (...args: unknown[]) => mockConnect(...args),
    eval: (...args: unknown[]) => mockEval(...args),
    disconnect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
};
jest.mock('redis', () => ({ createClient: () => fakeClient }));
jest.mock('@/env.mjs', () => ({ env: { CACHE_URL: 'redis://127.0.0.1:6379' } }));

const never = () => new Promise<never>(() => {});

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConnect.mockReset();
    mockEval.mockReset();
    fakeClient.isReady = false;
});
afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    await disconnectCache();
});

describe('cacheIncrWindow deadline', () => {
    it('counts when Valkey answers in time', async () => {
        mockConnect.mockImplementation(async () => {
            fakeClient.isReady = true;
        });
        mockEval.mockResolvedValue([3, 900]);
        await expect(cacheIncrWindow('k', 1000)).resolves.toEqual({ count: 3, resetInMs: 900 });
    });

    it('is unavailable when Valkey accepts the connection and never replies', async () => {
        mockConnect.mockImplementation(async () => {
            fakeClient.isReady = true;
        });
        mockEval.mockImplementation(never);
        const counted = cacheIncrWindow('k', 1000);
        await jest.advanceTimersByTimeAsync(INCR_WINDOW_DEADLINE_MS);
        await expect(counted).resolves.toBe('unavailable');
    });

    it('is unavailable when the connection never completes', async () => {
        mockConnect.mockImplementation(never);
        const counted = cacheIncrWindow('k', 1000);
        await jest.advanceTimersByTimeAsync(INCR_WINDOW_DEADLINE_MS);
        await expect(counted).resolves.toBe('unavailable');
        expect(mockEval).not.toHaveBeenCalled();
    });
});
