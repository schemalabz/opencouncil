import { CacheHandler } from '@neshca/cache-handler';
import createRedisHandler from '@neshca/cache-handler/redis-strings';
import createLruHandler from '@neshca/cache-handler/local-lru';
import { createClient } from 'redis';

CacheHandler.onCreation(async () => {
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
    const handler = createRedisHandler({
      client,
      keyPrefix: 'oc:',
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
