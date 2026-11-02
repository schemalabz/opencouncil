/**
 * A fixed-window counter per key, in the memory of one server process.
 *
 * It is a brake for a public endpoint, not a quota: another instance and a
 * restart each start from zero. Cleanup runs at most once per minute when
 * the map grows above 5000 keys. Expired keys remain until the next cleanup.
 */
export interface RateLimiter {
    /** True when the key may proceed; false when it used up the window. */
    take(key: string, now?: number): boolean;
}

const PRUNE_ABOVE = 5000;
const PRUNE_INTERVAL_MS = 60_000;

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
    const windows = new Map<string, { start: number; count: number }>();
    let nextPruneAt = 0;

    function prune(now: number) {
        for (const [key, window] of windows) {
            if (now - window.start >= windowMs) windows.delete(key);
        }
    }

    return {
        take(key, now = Date.now()) {
            if (windows.size > PRUNE_ABOVE && now >= nextPruneAt) {
                prune(now);
                nextPruneAt = now + PRUNE_INTERVAL_MS;
            }
            const window = windows.get(key);
            if (!window || now - window.start >= windowMs) {
                windows.set(key, { start: now, count: 1 });
                return true;
            }
            if (window.count >= limit) return false;
            window.count += 1;
            return true;
        },
    };
}
