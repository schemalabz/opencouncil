/** @jest-environment node */

const mockEnv: { YOUTUBE_API_KEY?: string } = { YOUTUBE_API_KEY: 'test-key' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

const mockCacheGetJSON = jest.fn();
const mockCacheSetJSON = jest.fn();
jest.mock('@/lib/cache/valkey', () => ({
    cacheGetJSON: (...args: unknown[]) => mockCacheGetJSON(...args),
    cacheSetJSON: (...args: unknown[]) => mockCacheSetJSON(...args),
}));

import { resolveChannelId } from '../youtube';

const forbidden = () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'cannot act on behalf' } as Response);
const ok = (body: unknown) => ({ ok: true, json: async () => body } as Response);

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.YOUTUBE_API_KEY = 'test-key';
    mockCacheGetJSON.mockResolvedValue(null);
    mockCacheSetJSON.mockResolvedValue(true);
});

describe('resolveChannelId — /c/ vanity fallback (search.list)', () => {
    it('retries the intermittent search 403 and succeeds', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(forbidden())
            .mockResolvedValueOnce(forbidden())
            .mockResolvedValueOnce(ok({ items: [{ id: { channelId: 'UCresolved' } }] })) as jest.Mock;

        const id = await resolveChannelId('https://www.youtube.com/c/CityOfAthens');

        expect(id).toBe('UCresolved');
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(mockCacheSetJSON).toHaveBeenCalledWith('oc:youtube:channel-id:https://www.youtube.com/c/CityOfAthens', 'UCresolved', expect.any(Number));
    });

    it('gives up after the retry cap when search keeps 403ing', async () => {
        global.fetch = jest.fn().mockResolvedValue(forbidden()) as jest.Mock;

        await expect(resolveChannelId('https://www.youtube.com/c/CityOfAthens')).rejects.toThrow('403');
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });
});

describe('resolveChannelId — non-vanity paths are unaffected', () => {
    it('resolves a handle via channels.list without retry', async () => {
        global.fetch = jest.fn().mockResolvedValue(ok({ items: [{ id: 'UChandle' }] })) as jest.Mock;

        const id = await resolveChannelId('https://www.youtube.com/@cityofathens.youtube');

        expect(id).toBe('UChandle');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns a canonical /channel/UC… id with no API call', async () => {
        global.fetch = jest.fn() as jest.Mock;

        const id = await resolveChannelId('https://www.youtube.com/channel/UCX5CxaBSCrAJxQawnE1sKHw');

        expect(id).toBe('UCX5CxaBSCrAJxQawnE1sKHw');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
