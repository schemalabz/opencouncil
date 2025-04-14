import { unstable_cache } from 'next/cache';

/**
 * Creates a cached version of a function with logging
 * 
 * @param fn The function to cache
 * @param keyParts Parts that make up the cache key
 * @param options Options for the cache including tags
 * @returns A cached version of the function
 */
export function createCache<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  options?: { tags?: string[]; }
): () => Promise<T> {
  return unstable_cache(
    async () => {
      const start = performance.now();
      try {
        const result = await fn();
        const duration = (performance.now() - start) / 1000;
        console.log(`CACHE MISS: [${keyParts.join(':')}] ${duration.toFixed(2)}s`);
        return result;
      } catch (error) {
        console.error(`[${keyParts.join(':')}] ERROR:`, error);
        throw error;
      }
    },
    keyParts,
    options
  );
}
