import { withinDeadline } from "@/lib/utils/withinDeadline";
import { cacheAcquire } from "./valkey";

/** When each key last alerted from this process: the window's stand-in without Valkey. */
const alertedAt = new Map<string, number>();

/**
 * How long the shared window may take to answer. Alerts matter most when
 * Valkey is the thing that broke, so a silent Valkey must not hold them:
 * past the deadline the window is the one in this process.
 */
export const ALERT_WINDOW_DEADLINE_MS = 1000;

/**
 * One alert per window per key, across containers: true when the caller
 * should alert now. The window is a marker in Valkey, so every container
 * shares it. Without Valkey, each process keeps its own window, which still
 * bounds the alerts. Each alert names its own key, so no two share a window.
 */
export async function claimAlertWindow(key: string, ttlSeconds: number): Promise<boolean> {
    const answer = await withinDeadline(cacheAcquire(key, ttlSeconds), ALERT_WINDOW_DEADLINE_MS);
    const claim = answer === "timeout" ? "unavailable" : answer;
    const windowOpen = Date.now() - (alertedAt.get(key) ?? 0) >= ttlSeconds * 1000;
    if (claim === "acquired" || (claim === "unavailable" && windowOpen)) {
        alertedAt.set(key, Date.now());
        return true;
    }
    return false;
}
