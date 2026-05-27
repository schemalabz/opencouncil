import { CacheHandler } from '@neshca/cache-handler';
import createRedisHandler from '@neshca/cache-handler/redis-strings';
import createLruHandler from '@neshca/cache-handler/local-lru';
import { createClient } from 'redis';

CacheHandler.onCreation(async ({ buildId }) => {
  if (!process.env.CACHE_URL) {
    console.info('[cache-handler] CACHE_URL not set — using in-memory LRU cache');
    return {
      handlers: [createLruHandler()],
    };
  }

  let client;

  try {
    const url = process.env.CACHE_URL;
    // The `redis` npm package uses rediss:// for TLS, but DO Valkey uses valkeys://
    const normalizedUrl = url.replace(/^valkeys:\/\//, 'rediss://');

    client = createClient({
      url: normalizedUrl,
    });

    client.on('error', (error) => {
      console.error('[cache-handler] Valkey client error:', error.message);
    });
  } catch (error) {
    console.warn('[cache-handler] Failed to create Valkey client:', error.message);
  }

  if (client) {
    try {
      console.info('[cache-handler] Connecting to Valkey...');
      await client.connect();
      console.info('[cache-handler] Valkey connected.');
    } catch (error) {
      console.warn('[cache-handler] Failed to connect to Valkey:', error.message);
      client.disconnect().catch(() => {});
      client = undefined;
    }
  }

  if (client?.isReady) {
    // Flush stale cached pages when a new build is deployed.
    // Compares the current Next.js build ID against a sentinel key in Valkey.
    // First instance to boot after a deploy flushes; others find the updated sentinel and skip.
    const SENTINEL_KEY = 'oc:__build_id__';
    try {
      if (!buildId) {
        console.warn('[cache-handler] No build ID available — skipping deploy flush check');
      } else {
        const storedBuildId = await client.get(SENTINEL_KEY);

        if (storedBuildId !== buildId) {
          console.info(
            `[cache-handler] Build ID changed: ${storedBuildId ?? '(none)'} → ${buildId} — flushing cache`,
          );
          await client.flushDb();
          await client.set(SENTINEL_KEY, buildId);
        } else {
          console.info(`[cache-handler] Build ID unchanged (${buildId}) — skipping flush`);
        }
      }
    } catch (error) {
      console.warn('[cache-handler] Deploy flush check failed:', error.message);
    }

    // Namespace by buildId so old-build instances during a rolling deploy can't
    // pollute the new build's cache (and vice-versa). Without this, an old
    // instance writes HTML referencing its own chunk hashes into the shared
    // cache, then new instances serve it and 404 on the chunks they don't have.
    const handler = createRedisHandler({
      client,
      keyPrefix: `oc:${buildId ?? 'nobuild'}:`,
      timeoutMs: 1000,
      keyExpirationStrategy: 'EXAT',
      sharedTagsKey: '__oc_tags__',
      revalidateTagQuerySize: 100,
    });

    return {
      handlers: [handler],
    };
  }

  console.warn('[cache-handler] Valkey unavailable — falling back to in-memory LRU');
  return {
    handlers: [createLruHandler()],
  };
});

export default CacheHandler;
