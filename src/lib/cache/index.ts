import { revalidateTag, unstable_cache } from 'next/cache';
import { IS_DEV } from '@/lib/utils';

/**
 * Revalidate all cached meeting data (subjects, statistics, derived status,
 * task status). Mirrors the tag set used by getMeetingDataCore, so a single
 * call busts everything the meeting and subject pages read.
 *
 * Call this immediately after persisting new meeting/subject data and BEFORE
 * any slow side effects (e.g. rate-limited notification sends). Otherwise a
 * recipient who clicks a notification before the send loop finishes can be
 * served stale, pre-summarize content.
 */
export function revalidateMeeting(cityId: string, meetingId: string): void {
  // revalidateTag throws ("static generation store missing") when called outside
  // a request scope (e.g. background reprocessing, tests). A cache hiccup should
  // never fail the surrounding task, so log and continue — matching the existing
  // defensive handling in src/lib/tasks/tasks.ts.
  try {
    revalidateTag(`city:${cityId}:meetings`, 'max');
    revalidateTag(`city:${cityId}:meeting:${meetingId}`, 'max');
  } catch (error) {
    console.error(`Error revalidating meeting cache for ${cityId}/${meetingId}:`, error);
  }
}

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
