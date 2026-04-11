import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import { withUserAuthorizedToEdit } from '@/lib/auth';
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
    client = createClient({ url: normalizedUrl });
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
  // Auth check outside try/catch so its error propagates directly
  await withUserAuthorizedToEdit({});

  try {
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
    console.error('Error fetching cache stats:', error);
    // Reset client on connection failures so next request retries
    if (client && !client.isReady) {
      client.disconnect().catch(() => {});
      client = null;
    }
    return NextResponse.json({
      connected: false,
      backend: 'valkey (error)',
      error: error instanceof Error ? error.message : 'Unknown error',
      instance: os.hostname(),
    }, { status: 500 });
  }
}
