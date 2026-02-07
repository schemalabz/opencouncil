import { unstable_cache } from 'next/cache';

/**
 * Creates a cached version of a function with logging.
 * Logs CACHE HIT or CACHE MISS with timing for each call.
 */
export function createCache<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  options?: { tags?: string[]; }
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
    const result = await cached();
    if (!wasMiss) {
      console.log(`  HIT  [${key}]`);
    }
    return result;
  };
}
