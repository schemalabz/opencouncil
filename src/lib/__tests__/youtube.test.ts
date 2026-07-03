/** @jest-environment node */

const mockEnv: { YOUTUBE_API_KEY?: string } = { YOUTUBE_API_KEY: 'test-key' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

const mockCacheGetJSON = jest.fn();
const mockCacheSetJSON = jest.fn();
jest.mock('@/lib/cache/valkey', () => ({
    cacheGetJSON: (...args: unknown[]) => mockCacheGetJSON(...args),
    cacheSetJSON: (...args: unknown[]) => mockCacheSetJSON(...args),
}));

import { listRecentChannelVideos } from '../youtube';

function searchItem(videoId: string, liveBroadcastContent: string, title = videoId) {
    return {
        id: { videoId },
        snippet: { title, publishedAt: '2026-06-10T20:00:00Z', liveBroadcastContent },
    };
}

function mockFetchOnce(items: unknown[]) {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.YOUTUBE_API_KEY = 'test-key';
    mockCacheGetJSON.mockResolvedValue(null);
    mockCacheSetJSON.mockResolvedValue(true);
    global.fetch = jest.fn();
});

describe('listRecentChannelVideos', () => {
    it('excludes scheduled ("upcoming") and live streams, keeping only finished videos', async () => {
        mockFetchOnce([
            searchItem('finished', 'none'),
            searchItem('scheduled', 'upcoming'),
            searchItem('broadcasting', 'live'),
        ]);

        const videos = await listRecentChannelVideos('UCchannel');

        expect(videos.map(v => v.videoId)).toEqual(['finished']);
    });

    it('keeps videos with no liveBroadcastContent field (treated as finished)', async () => {
        mockFetchOnce([
            { id: { videoId: 'plain' }, snippet: { title: 'plain', publishedAt: '2026-06-10T20:00:00Z' } },
        ]);

        const videos = await listRecentChannelVideos('UCchannel');

        expect(videos.map(v => v.videoId)).toEqual(['plain']);
    });

    it('returns the cached listing without hitting the API', async () => {
        mockCacheGetJSON.mockResolvedValue([{ videoId: 'cached', title: 'c', publishedAt: 'x' }]);

        const videos = await listRecentChannelVideos('UCchannel');

        expect(videos.map(v => v.videoId)).toEqual(['cached']);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
