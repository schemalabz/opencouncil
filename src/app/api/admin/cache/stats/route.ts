import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { env } from '@/env.mjs';
import os from 'os';

export const dynamic = 'force-dynamic';

// Module-level singleton — reused across requests, avoids connect/disconnect overhead
let client: ReturnType<typeof createClient> | null = null;
let connectingPromise: Promise<ReturnType<typeof createClient> | null> | null = null;

async function getClient() {
  if (client?.isReady) return client;
  // Deduplicate concurrent connect attempts
  if (connectingPromise) return connectingPromise;

  const cacheUrl = env.CACHE_URL;
  if (!cacheUrl) return null;

  connectingPromise = (async () => {
    // Disconnect stale client before replacing (prevents leaked reconnection timers)
    if (client) {
      client.disconnect().catch(() => {});
    }
    // The `redis` npm package uses rediss:// for TLS; DO Valkey uses valkeys://
    const normalizedUrl = cacheUrl.replace(/^valkeys:\/\//, 'rediss://');
    // pingInterval keeps the TCP connection warm against DO Valkey's ~300s
    // idle timeout — same reasoning as cache-handler.mjs.
    client = createClient({ url: normalizedUrl, pingInterval: 60_000 });
    client.on('error', (error) => {
      console.error('[cache-stats] Valkey client error:', error.message);
    });
    await client.connect();
    return client;
  })();

  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

export async function GET() {
  try {
    await withUserAuthorizedToEdit({});
    const redisClient = await getClient();

    if (!redisClient) {
      return NextResponse.json({
        connected: false,
        backend: 'in-memory (CACHE_URL not set)',
        instance: os.hostname(),
      });
    }

    const [keyCount, infoRaw] = await Promise.all([
      redisClient.dbSize(),
      redisClient.info('memory'),
    ]);

    const memoryMatch = infoRaw.match(/used_memory_human:(\S+)/);
    const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

    return NextResponse.json({
      connected: true,
      backend: 'valkey',
      keyCount,
      memoryUsed,
      instance: os.hostname(),
    });
  } catch (error) {
    // Reset client on connection failures so next request retries
    if (!(error instanceof ApiError) && client && !client.isReady) {
      client.disconnect().catch(() => {});
      client = null;
    }
    return handleApiError(error, 'Failed to read the cache stats');
  }
}
