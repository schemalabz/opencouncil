/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }));
jest.mock('@/env.mjs', () => ({ env: { CACHE_URL: 'redis://cache.internal:6379' } }));

const mockConnect = jest.fn();
jest.mock('redis', () => ({
    createClient: () => ({
        isReady: false,
        on: jest.fn(),
        connect: mockConnect,
        disconnect: jest.fn().mockResolvedValue(undefined),
    }),
}));

import { GET } from '@/app/api/admin/cache/stats/route';

describe('GET /api/admin/cache/stats', () => {
    it('answers a connection failure with a 500 that names neither the error nor the host', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockConnect.mockRejectedValue(new Error('connect ECONNREFUSED cache.internal:6379'));

        const response = await GET();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to read the cache stats' });
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
