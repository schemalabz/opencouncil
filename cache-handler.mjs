import { setTimeout as delay } from 'node:timers/promises';
import { CacheHandler } from '@fortedigital/nextjs-cache-handler';
import createRedisHandler from '@fortedigital/nextjs-cache-handler/redis-strings';
import createLruHandler from '@fortedigital/nextjs-cache-handler/local-lru';
import { createClient } from 'redis';
import { cacheNamespace } from './src/lib/cache/namespace.mjs';

// Next loads this file more than once in one process: the app's server loads
// it, and the proxy bundle holds its own copy. Each copy configures itself
// once. All copies use the handlers of the first one, so the proxy reads the
// entries that the app's tag clears remove, also with the in-memory cache,
// and the process opens one Valkey connection.
const SHARED_HANDLERS = Symbol.for('opencouncil.cache-handlers');

CacheHandler.onCreation(({ buildId }) => {
  globalThis[SHARED_HANDLERS] ??= createHandlers(buildId);
  return globalThis[SHARED_HANDLERS];
});

async function createHandlers(buildId) {
  if (!process.env.CACHE_URL) {
    console.info('[cache-handler] CACHE_URL not set — using in-memory LRU cache');
    return { handlers: [createLruHandler()] };
  }

  let client;
  try {
    client = createClient({
      // The `redis` npm package uses rediss:// for TLS, but DO Valkey uses valkeys://
      url: process.env.CACHE_URL.replace(/^valkeys:\/\//, 'rediss://'),
      // Keep the connection warm — DO managed Valkey closes idle TCP sockets
      // around the 300s mark, producing periodic "Socket closed unexpectedly"
      // errors and adding reconnect latency to the first request after each.
      pingInterval: 60_000,
      socket: {
        // node-redis stops after a socket timeout by default, and the cache
        // then stays off until the process restarts. Keep trying.
        reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 5_000),
      },
    });
  } catch (error) {
    console.warn('[cache-handler] Invalid CACHE_URL, using in-memory LRU cache:', error.message);
    return { handlers: [createLruHandler()] };
  }
  client.on('error', (error) => {
    console.error('[cache-handler] Valkey client error:', error.message);
  });
  client.on('ready', () => {
    console.info('[cache-handler] Valkey connected.');
  });

  // Valkey is the cache whether it is up at start or not. Until the client
  // connects, the handler refuses each call, so every read goes to the
  // database. A fallback to an in-memory cache would keep this process apart
  // from the tag clears of the other instances until it restarts.
  console.info('[cache-handler] Connecting to Valkey...');
  const connected = client.connect().then(() => true, () => false);
  if (!(await Promise.race([connected, delay(5_000, false)]))) {
    console.warn('[cache-handler] Valkey is not reachable: reads go to the database until it connects');
  }

  const namespace = await cacheNamespace({ buildId });
  console.info(`[cache-handler] Cache namespace: oc:${namespace}:`);

  // Forte's redis-strings handler fixes the @neshca issues that drove #358:
  //   • TTL-bound tag hashmap (sharedTagsTtlKey) — no unbounded growth from bot pollution
  //   • Higher default revalidateTagQuerySize (10_000 vs the old 100) — fewer round-trips per scan
  //   • Tag revalidation is no longer O(n) over a single hash
  // We deliberately do NOT flushDb(): on a shared db that wipes the other
  // environment's cache. The per-build namespace makes superseded entries
  // unreachable; they expire via their TTLs.
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
    sharedTagsKey: `__oc_tags__:${namespace}`,
    sharedTagsTtlKey: `__oc_tags_ttl__:${namespace}`,
  });

  return { handlers: [handler] };
}

export default CacheHandler;
