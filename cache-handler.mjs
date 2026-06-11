import { CacheHandler } from '@fortedigital/nextjs-cache-handler';
import createRedisHandler from '@fortedigital/nextjs-cache-handler/redis-strings';
import createLruHandler from '@fortedigital/nextjs-cache-handler/local-lru';
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
      // Keep the connection warm — DO managed Valkey closes idle TCP sockets
      // around the 300s mark, producing periodic "Socket closed unexpectedly"
      // errors and adding reconnect latency to the first request after each.
      pingInterval: 60_000,
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
    // sharedTagsKey is also namespaced so a revalidateTag from an old-build
    // instance doesn't delete the new build's entries through the shared tag map.
    const namespace = buildId || 'nobuild';

    // Forte's redis-strings handler fixes the @neshca issues that drove #358:
    //   • TTL-bound tag hashmap (sharedTagsTtlKey) — no unbounded growth from bot pollution
    //   • Higher default revalidateTagQuerySize (10_000 vs the old 100) — fewer round-trips per scan
    //   • Tag revalidation is no longer O(n) over a single hash
    const handler = createRedisHandler({
      client,
      keyPrefix: `oc:${namespace}:`,
      // The old @neshca config used 1000ms, which (combined with the O(n) scan)
      // was a #358 failure mode: revalidation commands aborted under load. The
      // new handler removes the O(n) scan, but keep a generous ceiling so a
      // transient Valkey latency spike (e.g. a rolling-deploy flush) doesn't
      // abort revalidation. 5s matches the library default.
      timeoutMs: 5000,
      keyExpirationStrategy: 'EXAT',
      // Namespaced by buildId for the same rolling-deploy isolation as keyPrefix.
      sharedTagsKey: `__oc_tags__:${namespace}`,
      sharedTagsTtlKey: `__oc_tags_ttl__:${namespace}`,
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
