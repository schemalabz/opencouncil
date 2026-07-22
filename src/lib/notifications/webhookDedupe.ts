import { createClient } from 'redis';
import { env } from '@/env.mjs';

/**
 * Id-based replay protection for incoming webhooks (Bird).
 *
 * Atomic check-and-set against Valkey: `SET <key> 1 NX EX <ttl>`. A non-null
 * reply means the key did not exist (first time we've seen this event); a null
 * reply means it already existed (a replay/retry of the exact same event).
 *
 * Backend choice: Valkey is already wired via `CACHE_URL` (DO Valkey,
 * `valkeys://`) and proven in `src/app/api/admin/cache/stats/route.ts`. `SET NX`
 * is a single atomic op, so there is no read-then-write race. The 7-day TTL
 * comfortably covers Bird's retry horizon without unbounded key growth.
 *
 * Degradation: when `CACHE_URL` is unset (single-instance dev) or Valkey is
 * unreachable, the dedupe call FAILS OPEN — it returns `'unknown'` so the
 * webhook is still processed. Correctness is then guarded by the existing DB
 * layer (the `birdMessageId` unique constraint + forward-only status
 * progression), so failing open only loses replay *rejection*, not integrity.
 */

const KEY_PREFIX = 'bird:webhook:seen:';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 604800 — covers Bird's retry horizon

export type DedupeResult = 'new' | 'duplicate' | 'unknown';

// Module-level singleton — reused across requests, mirrors the pattern in
// src/app/api/admin/cache/stats/route.ts.
let client: ReturnType<typeof createClient> | null = null;
let connectingPromise: Promise<ReturnType<typeof createClient> | null> | null = null;

async function getClient(): Promise<ReturnType<typeof createClient> | null> {
    if (client?.isReady) return client;
    if (connectingPromise) return connectingPromise;

    const cacheUrl = env.CACHE_URL;
    if (!cacheUrl) return null;

    connectingPromise = (async () => {
        if (client) {
            client.disconnect().catch(() => {});
        }
        // The `redis` npm package uses rediss:// for TLS; DO Valkey uses valkeys://
        const normalizedUrl = cacheUrl.replace(/^valkeys:\/\//, 'rediss://');
        const next = createClient({ url: normalizedUrl, pingInterval: 60_000 });
        next.on('error', (error) => {
            console.error('[webhook-dedupe] Valkey client error:', error.message);
        });
        await next.connect();
        client = next;
        return client;
    })();

    try {
        return await connectingPromise;
    } finally {
        connectingPromise = null;
    }
}

/**
 * Atomically record that we've seen this webhook event id.
 *
 * @returns
 *   - `'new'`       — first time we've seen this id; caller should process it.
 *   - `'duplicate'` — already processed; caller should drop it (200 OK).
 *   - `'unknown'`   — dedupe unavailable (no CACHE_URL / Valkey down); fail open
 *                     and process, relying on the DB idempotency layer.
 */
export async function markWebhookSeen(id: string): Promise<DedupeResult> {
    try {
        const redisClient = await getClient();
        if (!redisClient) return 'unknown';

        const reply = await redisClient.set(`${KEY_PREFIX}${id}`, '1', {
            NX: true,
            EX: TTL_SECONDS,
        });
        // redis@4 returns 'OK' when set, null when NX prevented the write.
        return reply === null ? 'duplicate' : 'new';
    } catch (error) {
        // Reset a broken client so the next request reconnects.
        if (client && !client.isReady) {
            client.disconnect().catch(() => {});
            client = null;
        }
        console.warn(
            '[webhook-dedupe] dedupe check failed, failing open:',
            error instanceof Error ? error.message : error,
        );
        return 'unknown';
    }
}

/**
 * Remove a previously-recorded seen marker. Called when processing of a
 * first-seen event fails transiently (e.g. a DB error that returns 500 and
 * makes Bird retry) — without this, the dedupe entry would cause the retry to
 * be dropped as a duplicate and the event would be lost permanently.
 *
 * Best-effort: failures are swallowed (the entry will expire via its TTL).
 */
export async function clearWebhookSeen(id: string): Promise<void> {
    try {
        const redisClient = await getClient();
        if (!redisClient) return;
        await redisClient.del(`${KEY_PREFIX}${id}`);
    } catch (error) {
        console.warn(
            '[webhook-dedupe] failed to clear seen marker (will expire via TTL):',
            error instanceof Error ? error.message : error,
        );
    }
}
