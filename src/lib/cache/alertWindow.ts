import { cacheAcquire } from "./valkey";

/** When each key last alerted from this process: the window's stand-in without Valkey. */
const alertedAt = new Map<string, number>();

/**
 * One alert per window per key, across containers: true when the caller
 * should alert now. The window is a marker in Valkey, so every container
 * shares it. Without Valkey, each process keeps its own window, which still
 * bounds the alerts. Each alert names its own key, so no two share a window.
 */
export async function claimAlertWindow(key: string, ttlSeconds: number): Promise<boolean> {
    const claim = await cacheAcquire(key, ttlSeconds);
    const windowOpen = Date.now() - (alertedAt.get(key) ?? 0) >= ttlSeconds * 1000;
    if (claim === "acquired" || (claim === "unavailable" && windowOpen)) {
        alertedAt.set(key, Date.now());
        return true;
    }
    return false;
}
