import { unstable_cache } from 'next/cache';
import { IS_DEV } from '@/lib/utils';

/**
 * Creates a cached version of a function with logging.
 * Logs CACHE MISS (all environments) and CACHE HIT (dev only) with timing.
 *
 * IMPORTANT: Always use as `createCache(...)()` (create and immediately invoke).
 * Do NOT store the returned function and reuse it across requests — the `wasMiss`
 * flag is shared within the closure and will produce incorrect HIT/MISS logs
 * under concurrent access.
 */
export function createCache<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  options?: { tags?: string[]; revalidate?: number | false; }
): () => Promise<T> {
  const key = keyParts.join(':');
  let wasMiss = false;

  const cached = unstable_cache(
    async () => {
      wasMiss = true;
      const start = performance.now();
      try {
        const result = await fn();
        const ms = (performance.now() - start).toFixed(0);
        console.log(`  MISS [${key}] ${ms}ms`);
        return result;
      } catch (error) {
        console.error(`  ERR  [${key}]`, error);
        throw error;
      }
    },
    keyParts,
    options
  );

  return async () => {
    wasMiss = false;
    const start = performance.now();
    const result = await cached();
    const ms = (performance.now() - start).toFixed(0);
    if (!wasMiss && IS_DEV) {
      console.log(`  HIT  [${key}] ${ms}ms`);
    }
    return result;
  };
}
