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
    // Isolate cache entries per ENVIRONMENT and per BUILD. prod and staging can
    // point at the same Valkey db, and Next's runtime `buildId` here is
    // unreliable (frequently undefined → everything collapsed into one shared
    // `nobuild` namespace). Either way, cached RSC rendered by one build/env was
    // being served by another whose code has different server-action IDs →
    // "Failed to find Server Action". The env key (explicit APP_ENV, else the
    // NEXTAUTH_URL host) separates prod/staging; the build key (commit/build id)
    // separates deploys, so a new build never reads the previous build's stale
    // entries. keyPrefix and the shared-tags keys all use this namespace.
    //
    // We deliberately do NOT flushDb() anymore: on a shared db that wipes the
    // *other* environment's cache. The per-build namespace makes superseded
    // entries simply unreachable; they expire via their existing TTLs.
    const envKey =
      process.env.APP_ENV ||
      (() => {
        try {
          return new URL(process.env.NEXTAUTH_URL).host;
        } catch {
          return process.env.NODE_ENV || 'unknown';
        }
      })();
    const buildKey =
      process.env.SOURCE_COMMIT || process.env.BUILD_ID || buildId || 'nobuild';
    const namespace = `${envKey}:${buildKey}`;
    console.info(`[cache-handler] Cache namespace: oc:${namespace}:`);

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
