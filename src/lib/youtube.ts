import { env } from '@/env.mjs';
import { parseChannelRef } from '@/lib/utils/youtube';
import { cacheGetJSON, cacheSetJSON } from '@/lib/cache/valkey';

/**
 * Minimal YouTube Data API v3 client used by the poll-livestreams cron to locate
 * a meeting's livestream on an administrative body's channel.
 *
 * Quota notes (default 10k units/day): channels.list = 1 unit, search.list = 100
 * units. Channel-id resolution is cached long-term (ids are stable) and the recent
 * videos listing is cached briefly so multiple meetings sharing a channel cost a
 * single search per run.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3';

// Channel ids never change → cache aggressively. Recent-videos is volatile → short TTL.
const CHANNEL_ID_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CHANNEL_VIDEOS_TTL_SECONDS = 5 * 60; // 5 minutes
const MAX_RECENT_VIDEOS = 15;

export interface YouTubeVideo {
    videoId: string;
    title: string;
    publishedAt: string;
    description?: string;
}

function requireApiKey(): string {
    if (!env.YOUTUBE_API_KEY) {
        throw new Error('YOUTUBE_API_KEY is not configured');
    }
    return env.YOUTUBE_API_KEY;
}

async function ytFetch<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}/${path}`);
    url.search = new URLSearchParams({ ...params, key: requireApiKey() }).toString();

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`YouTube API ${path} failed: ${response.status} ${response.statusText} ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
}

interface ChannelListResponse {
    items?: Array<{ id: string }>;
}

interface SearchListResponse {
    items?: Array<{
        id?: { channelId?: string; videoId?: string };
        snippet?: { title?: string; publishedAt?: string; description?: string };
    }>;
}

/**
 * Resolves a stored channel URL (handle, /channel/UC…, /user, or /c vanity) to a
 * canonical channel id. Cached in Valkey keyed by the input URL. Returns null when
 * the channel can't be resolved.
 */
export async function resolveChannelId(channelUrl: string): Promise<string | null> {
    const ref = parseChannelRef(channelUrl);
    if (!ref) return null;

    // A canonical id needs no API call.
    if (ref.kind === 'id') return ref.value;

    const cacheKey = `oc:youtube:channel-id:${channelUrl.trim()}`;
    const cached = await cacheGetJSON<string>(cacheKey);
    if (cached) return cached;

    let channelId: string | null = null;

    if (ref.kind === 'handle') {
        const data = await ytFetch<ChannelListResponse>('channels', {
            part: 'id',
            forHandle: `@${ref.value}`,
        });
        channelId = data.items?.[0]?.id ?? null;
    } else if (ref.kind === 'user') {
        const data = await ytFetch<ChannelListResponse>('channels', {
            part: 'id',
            forUsername: ref.value,
        });
        channelId = data.items?.[0]?.id ?? null;
    } else {
        // Vanity /c/ URLs aren't directly resolvable — fall back to channel search.
        const data = await ytFetch<SearchListResponse>('search', {
            part: 'id',
            type: 'channel',
            q: ref.value,
            maxResults: '1',
        });
        channelId = data.items?.[0]?.id?.channelId ?? null;
    }

    if (channelId) {
        await cacheSetJSON(cacheKey, channelId, CHANNEL_ID_TTL_SECONDS);
    }
    return channelId;
}

/**
 * Lists the channel's most recent videos (newest first), briefly cached in Valkey.
 *
 * Uses search.list ordered by date rather than filtering to live broadcasts:
 * council livestreams surface as ordinary recent uploads once finished, so the
 * broad listing is the safe superset and the LLM matcher picks the right one.
 */
export async function listRecentChannelVideos(channelId: string): Promise<YouTubeVideo[]> {
    const cacheKey = `oc:youtube:channel-videos:${channelId}`;
    const cached = await cacheGetJSON<YouTubeVideo[]>(cacheKey);
    if (cached) return cached;

    const data = await ytFetch<SearchListResponse>('search', {
        part: 'snippet',
        channelId,
        type: 'video',
        order: 'date',
        maxResults: String(MAX_RECENT_VIDEOS),
    });

    const videos: YouTubeVideo[] = (data.items ?? [])
        .filter(item => item.id?.videoId)
        .map(item => ({
            videoId: item.id!.videoId!,
            title: item.snippet?.title ?? '',
            publishedAt: item.snippet?.publishedAt ?? '',
            description: item.snippet?.description,
        }));

    await cacheSetJSON(cacheKey, videos, CHANNEL_VIDEOS_TTL_SECONDS);
    return videos;
}

/** Canonical watch URL for a video id. */
export function watchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
}
