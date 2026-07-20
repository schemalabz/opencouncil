import { env } from '@/env.mjs';
import { parseChannelRef } from '@/lib/utils/youtube';
import { cacheGetJSON, cacheSetJSON } from '@/lib/cache/valkey';

/**
 * Minimal YouTube Data API v3 client used by the poll-livestreams cron to locate
 * a meeting's livestream on an administrative body's channel.
 *
 * Quota notes (default 10k units/day): channels.list / playlistItems.list /
 * videos.list = 1 unit each, search.list = 100 units. Channel-id resolution is
 * cached long-term (ids are stable) and the recent videos listing is cached
 * briefly so multiple meetings sharing a channel cost a single lookup per run.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3';

// Channel ids never change → cache aggressively. Recent-videos is volatile → short TTL.
const CHANNEL_ID_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CHANNEL_VIDEOS_TTL_SECONDS = 5 * 60; // 5 minutes
// Must stay ≤ 50: both playlistItems.list (maxResults) and videos.list (comma-separated
// ids) cap at 50 per request, and listRecentChannelVideos issues one call to each — a
// larger value would 400 or silently drop tail videos.
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

interface ChannelContentDetailsResponse {
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
}

interface PlaylistItemsResponse {
    items?: Array<{ contentDetails?: { videoId?: string } }>;
}

interface VideosListResponse {
    items?: Array<{
        id?: string;
        snippet?: {
            title?: string;
            publishedAt?: string;
            description?: string;
            // "none" for a finished/regular upload, "live" while broadcasting,
            // "upcoming" for a scheduled premiere/stream that hasn't started.
            liveBroadcastContent?: string;
        };
        // Present only for videos that are (or were) live broadcasts.
        liveStreamingDetails?: {
            scheduledStartTime?: string;
            actualStartTime?: string;
            actualEndTime?: string;
        };
    }>;
}

/**
 * search.list intermittently returns 403 ("cannot act on behalf of the specified
 * Google account") on our key — a known, transient YouTube quirk (~40% of calls in
 * practice). Retry that specific failure a few times before surfacing it, so
 * channel-id resolution for /c/ vanity URLs (the only remaining search.list caller)
 * doesn't fail on a flaky response. Other errors are terminal and rethrow at once.
 */
const SEARCH_MAX_ATTEMPTS = 3;
async function searchListWithRetry(params: Record<string, string>): Promise<SearchListResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SEARCH_MAX_ATTEMPTS; attempt++) {
        try {
            return await ytFetch<SearchListResponse>('search', params);
        } catch (error) {
            lastError = error;
            if (!(error instanceof Error && error.message.includes('search failed: 403'))) throw error;
        }
    }
    throw lastError;
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
        // search.list is flaky (intermittent 403), so retry that failure.
        const data = await searchListWithRetry({
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
 * A channel's auto-generated "uploads" playlist id. For every standard channel it
 * is the channel id with the "UC" prefix swapped for "UU"; only non-standard ids
 * need a channels.list lookup.
 */
async function resolveUploadsPlaylistId(channelId: string): Promise<string | null> {
    if (channelId.startsWith('UC')) return `UU${channelId.slice(2)}`;

    const data = await ytFetch<ChannelContentDetailsResponse>('channels', {
        part: 'contentDetails',
        id: channelId,
    });
    return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

/**
 * True for a scheduled ("upcoming") or in-progress ("live") broadcast — a stream
 * that has no complete recording to transcribe yet. A finished stream reports
 * liveBroadcastContent "none" and carries an actualEndTime, so it passes.
 */
function isUnfinishedStream(video: NonNullable<VideosListResponse['items']>[number]): boolean {
    const state = video.snippet?.liveBroadcastContent;
    if (state === 'live' || state === 'upcoming') return true;

    // Defensive: a broadcast that has started (or is only scheduled) but not ended
    // is still in progress, even if liveBroadcastContent momentarily lags.
    const details = video.liveStreamingDetails;
    if (details && (details.actualStartTime || details.scheduledStartTime) && !details.actualEndTime) {
        return true;
    }
    return false;
}

/**
 * Lists the channel's most recent *finished* videos (newest first), briefly cached
 * in Valkey.
 *
 * Reads the channel's uploads playlist via playlistItems.list rather than
 * search.list. search.list queries YouTube's search index, which lags by
 * minutes-to-hours, is unreliable for just-finished livestreams, and (observed
 * on our key) intermittently 403s — so a council stream that ended within a
 * meeting's polling window could be missed entirely. The uploads playlist is the
 * channel's direct upload log: immediate, reliable, and far cheaper (1 unit vs 100).
 *
 * A videos.list call then supplies each video's authoritative live status, so
 * scheduled ("upcoming") and in-progress ("live") streams are excluded — they have
 * no complete recording, and matching one would transcribe a partial video.
 */
export async function listRecentChannelVideos(channelId: string): Promise<YouTubeVideo[]> {
    const cacheKey = `oc:youtube:channel-videos:${channelId}`;
    const cached = await cacheGetJSON<YouTubeVideo[]>(cacheKey);
    if (cached) return cached;

    const uploadsPlaylistId = await resolveUploadsPlaylistId(channelId);
    if (!uploadsPlaylistId) return [];

    const playlist = await ytFetch<PlaylistItemsResponse>('playlistItems', {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: String(MAX_RECENT_VIDEOS),
    });

    // Newest-first video ids from the uploads playlist.
    const orderedIds = (playlist.items ?? [])
        .map(item => item.contentDetails?.videoId)
        .filter((id): id is string => Boolean(id));

    if (orderedIds.length === 0) return [];

    // One videos.list call (≤50 ids) for titles + authoritative live status.
    const details = await ytFetch<VideosListResponse>('videos', {
        part: 'snippet,liveStreamingDetails',
        id: orderedIds.join(','),
    });

    const byId = new Map((details.items ?? []).map(v => [v.id, v] as const));

    const videos: YouTubeVideo[] = orderedIds
        .map(id => byId.get(id))
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
        .filter(v => !isUnfinishedStream(v))
        .map(v => ({
            videoId: v.id!,
            title: v.snippet?.title ?? '',
            publishedAt: v.snippet?.publishedAt ?? '',
            description: v.snippet?.description,
        }));

    await cacheSetJSON(cacheKey, videos, CHANNEL_VIDEOS_TTL_SECONDS);
    return videos;
}

/** Canonical watch URL for a video id. */
export function watchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
}
