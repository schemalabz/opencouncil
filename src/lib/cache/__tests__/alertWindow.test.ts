/** @jest-environment node */
import { ALERT_WINDOW_DEADLINE_MS, claimAlertWindow } from '../alertWindow';

const mockAcquire = jest.fn();
jest.mock('../valkey', () => ({ cacheAcquire: (...args: unknown[]) => mockAcquire(...args) }));

beforeEach(() => {
    jest.useFakeTimers();
    mockAcquire.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('claimAlertWindow', () => {
    it('follows the shared window when Valkey answers', async () => {
        mockAcquire.mockResolvedValueOnce('acquired').mockResolvedValueOnce('held');
        await expect(claimAlertWindow('answered', 600)).resolves.toBe(true);
        await expect(claimAlertWindow('answered', 600)).resolves.toBe(false);
    });

    it('falls back to the window of this process when Valkey does not answer in time', async () => {
        mockAcquire.mockImplementation(() => new Promise<never>(() => {}));
        const first = claimAlertWindow('silent', 600);
        await jest.advanceTimersByTimeAsync(ALERT_WINDOW_DEADLINE_MS);
        await expect(first).resolves.toBe(true);

        const second = claimAlertWindow('silent', 600);
        await jest.advanceTimersByTimeAsync(ALERT_WINDOW_DEADLINE_MS);
        await expect(second).resolves.toBe(false);
    });
});
