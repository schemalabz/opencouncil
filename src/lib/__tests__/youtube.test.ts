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

const CHANNEL_ID = 'UCX5CxaBSCrAJxQawnE1sKHw';

// Route each mocked YouTube API call by endpoint. playlistItems returns the
// ordered ids; videos returns per-id details keyed off `videosById`. When
// `channelsUploads` is set, /channels resolves to that uploads-playlist id
// (the non-UC fallback path).
function installFetch(orderedIds: string[], videosById: Record<string, unknown>, channelsUploads?: string) {
    global.fetch = jest.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/channels')) {
            return {
                ok: true,
                json: async () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: channelsUploads } } }] }),
            } as Response;
        }
        if (url.includes('/playlistItems')) {
            return {
                ok: true,
                json: async () => ({ items: orderedIds.map(id => ({ contentDetails: { videoId: id } })) }),
            } as Response;
        }
        if (url.includes('/videos')) {
            const requested = new URL(url).searchParams.get('id')!.split(',');
            return {
                ok: true,
                json: async () => ({ items: requested.map(id => videosById[id]).filter(Boolean) }),
            } as Response;
        }
        throw new Error(`unexpected fetch: ${url}`);
    }) as jest.Mock;
}

function finished(id: string, title = id) {
    return {
        id,
        snippet: { title, publishedAt: '2026-07-03T09:13:39Z', liveBroadcastContent: 'none' },
        liveStreamingDetails: { actualStartTime: '2026-07-03T10:06:46Z', actualEndTime: '2026-07-03T12:40:21Z' },
    };
}
function plainUpload(id: string, title = id) {
    return { id, snippet: { title, publishedAt: '2026-07-03T09:13:39Z', liveBroadcastContent: 'none' } };
}
function live(id: string) {
    return {
        id,
        snippet: { title: id, publishedAt: '2026-07-03T10:00:00Z', liveBroadcastContent: 'live' },
        liveStreamingDetails: { actualStartTime: '2026-07-03T10:06:46Z' },
    };
}
function upcoming(id: string) {
    return {
        id,
        snippet: { title: id, publishedAt: '2026-07-03T09:00:00Z', liveBroadcastContent: 'upcoming' },
        liveStreamingDetails: { scheduledStartTime: '2026-07-03T16:00:00Z' },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.YOUTUBE_API_KEY = 'test-key';
    mockCacheGetJSON.mockResolvedValue(null);
    mockCacheSetJSON.mockResolvedValue(true);
});

describe('listRecentChannelVideos', () => {
    it('returns finished videos in uploads-playlist order', async () => {
        installFetch(['a', 'b'], { a: finished('a'), b: plainUpload('b') });

        const videos = await listRecentChannelVideos(CHANNEL_ID);

        expect(videos.map(v => v.videoId)).toEqual(['a', 'b']);
    });

    it('excludes scheduled ("upcoming") and in-progress ("live") streams', async () => {
        installFetch(['done', 'nowlive', 'later'], {
            done: finished('done'),
            nowlive: live('nowlive'),
            later: upcoming('later'),
        });

        const videos = await listRecentChannelVideos(CHANNEL_ID);

        expect(videos.map(v => v.videoId)).toEqual(['done']);
    });

    it('excludes a broadcast that has started but not ended, even if flagged "none"', async () => {
        // liveBroadcastContent lag: reports "none" but there is no actualEndTime yet.
        const lagging = {
            id: 'lagging',
            snippet: { title: 'lagging', publishedAt: '2026-07-03T10:00:00Z', liveBroadcastContent: 'none' },
            liveStreamingDetails: { actualStartTime: '2026-07-03T10:06:46Z' },
        };
        installFetch(['lagging', 'done'], { lagging, done: finished('done') });

        const videos = await listRecentChannelVideos(CHANNEL_ID);

        expect(videos.map(v => v.videoId)).toEqual(['done']);
    });

    it('derives the uploads playlist id (UC… → UU…) without a channels.list call', async () => {
        installFetch(['a'], { a: finished('a') });

        await listRecentChannelVideos(CHANNEL_ID);

        const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
        expect(urls.find(u => u.includes('/playlistItems'))).toContain(`playlistId=UU${CHANNEL_ID.slice(2)}`);
        // No channels.list needed for a standard UC… id.
        expect(urls.some(u => u.includes('/channels'))).toBe(false);
    });

    it('resolves the uploads playlist via channels.list for a non-UC channel id', async () => {
        installFetch(['a'], { a: finished('a') }, 'UUfromChannelsList');

        const videos = await listRecentChannelVideos('HC0123456789abcdefghijkl');

        expect(videos.map(v => v.videoId)).toEqual(['a']);
        const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
        // Non-UC id can't be swapped → must ask channels.list, then use its uploads id.
        expect(urls.some(u => u.includes('/channels'))).toBe(true);
        expect(urls.find(u => u.includes('/playlistItems'))).toContain('playlistId=UUfromChannelsList');
    });

    it('returns the cached listing without hitting the API', async () => {
        mockCacheGetJSON.mockResolvedValue([{ videoId: 'cached', title: 'c', publishedAt: 'x' }]);
        global.fetch = jest.fn();

        const videos = await listRecentChannelVideos(CHANNEL_ID);

        expect(videos.map(v => v.videoId)).toEqual(['cached']);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
