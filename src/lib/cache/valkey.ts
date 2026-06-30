import { createClient } from 'redis';
import { env } from '@/env.mjs';

/**
 * Shared Valkey/Redis client for application-level caching and dedup markers.
 *
 * Mirrors the singleton + connection handling used by the Next.js cache handler
 * (cache-handler.mjs) and the cache-stats route. When CACHE_URL is unset (dev /
 * single-instance), every helper degrades gracefully: reads return null and
 * writes no-op, so callers don't need their own guards.
 */

// Module-level singleton — reused across requests, avoids connect/disconnect overhead.
let client: ReturnType<typeof createClient> | null = null;
let connectingPromise: Promise<ReturnType<typeof createClient> | null> | null = null;

async function getClient(): Promise<ReturnType<typeof createClient> | null> {
    if (client?.isReady) return client;
    // Deduplicate concurrent connect attempts.
    if (connectingPromise) return connectingPromise;

    const cacheUrl = env.CACHE_URL;
    if (!cacheUrl) return null;

    connectingPromise = (async () => {
        // Disconnect stale client before replacing (prevents leaked reconnection timers).
        if (client) {
            client.disconnect().catch(() => {});
        }
        // The `redis` npm package uses rediss:// for TLS; DO Valkey uses valkeys://.
        const normalizedUrl = cacheUrl.replace(/^valkeys:\/\//, 'rediss://');
        // pingInterval keeps the TCP connection warm against DO Valkey's ~300s idle
        // timeout — same reasoning as cache-handler.mjs.
        client = createClient({ url: normalizedUrl, pingInterval: 60_000 });
        client.on('error', (error) => {
            console.error('[valkey] client error:', error.message);
        });
        await client.connect();
        return client;
    })();

    try {
        return await connectingPromise;
    } catch (error) {
        // Reset on connect failure so the next call retries instead of reusing a dead client.
        console.error('[valkey] connect failed:', error instanceof Error ? error.message : error);
        if (client && !client.isReady) {
            client.disconnect().catch(() => {});
        }
        client = null;
        return null;
    } finally {
        connectingPromise = null;
    }
}

/**
 * Read and JSON-parse a cached value. Returns null when CACHE_URL is unset, the
 * key is missing, or anything fails (cache is best-effort, never a hard dependency).
 */
export async function cacheGetJSON<T>(key: string): Promise<T | null> {
    try {
        const redis = await getClient();
        if (!redis) return null;
        const raw = await redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
        console.error(`[valkey] get failed for ${key}:`, error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * JSON-serialize and store a value with a TTL (seconds). No-ops when CACHE_URL is
 * unset or on any failure. Returns true when the write landed.
 */
export async function cacheSetJSON(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    try {
        const redis = await getClient();
        if (!redis) return false;
        await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
        return true;
    } catch (error) {
        console.error(`[valkey] set failed for ${key}:`, error instanceof Error ? error.message : error);
        return false;
    }
}

/**
 * Whether a key exists. Returns false when CACHE_URL is unset or on failure.
 * Used for one-shot dedup markers (e.g. "did we already alert about this?").
 */
export async function cacheHas(key: string): Promise<boolean> {
    try {
        const redis = await getClient();
        if (!redis) return false;
        return (await redis.exists(key)) === 1;
    } catch (error) {
        console.error(`[valkey] exists failed for ${key}:`, error instanceof Error ? error.message : error);
        return false;
    }
}
