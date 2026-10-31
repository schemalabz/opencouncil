import "server-only";

import { claimAlertWindow } from "@/lib/cache/alertWindow";
import { cacheIncrWindow, isCacheConfigured } from "@/lib/cache/valkey";
import { sendAdminAlert } from "@/lib/discord-core";
import { allowance, MemoryWindows, type Allowance, type Cap, type WindowSample } from "./rules";

/**
 * The shared rate limiter. A surface names its caps, one per identity it
 * limits on (the actor, the target, everyone), and asks once per request:
 * a refusal names the cap and the wait. Counts live in Valkey, so every
 * container sees the same window; without CACHE_URL they live in this
 * process, which is the only one there is on a developer's machine or a
 * preview.
 *
 * This limiter fails open: when Valkey is configured but does not answer,
 * the request goes through uncounted and the operators get one alert. That
 * is the right trade for a surface whose cost per hit is an email or a
 * query. A surface that must never fail open, such as the SMS code, keeps
 * its own exact window in the database (src/lib/db/phoneVerification.ts)
 * and must not be moved onto this one.
 *
 * Caps are counted one at a time, in the order the surface gives them, and
 * counting stops at the first cap that refuses. A refused request therefore
 * never uses up the caps after it. Give the narrowest cap first (the
 * client before the whole form), so a client past its own cap cannot fill
 * the cap that everyone shares.
 */

// One counter per process, not per module graph: Next.js compiles a Server
// Action and a route handler apart, and each copy of this module would
// otherwise count on its own. The sign-in form and the Auth.js route must
// share the count of one address.
const globalForLimiter = globalThis as unknown as { rateLimitMemory?: MemoryWindows };
const memory = (globalForLimiter.rateLimitMemory ??= new MemoryWindows());

/** One refusal alert per surface and cap per hour; one degraded alert per ten minutes. */
const REFUSAL_ALERT_WINDOW_S = 60 * 60;
const DEGRADED_ALERT_WINDOW_S = 10 * 60;

export async function claimAllowance(surface: string, caps: Cap[]): Promise<Allowance> {
    let degraded = false;
    let result: Allowance = { ok: true };
    for (const cap of caps) {
        const window = await countHit(cap);
        if (window === "unavailable") {
            degraded = true;
            continue;
        }
        const sample: WindowSample = { cap, ...window };
        result = allowance([sample]);
        if (!result.ok) break;
    }
    if (degraded) void reportDegraded(surface);
    if (!result.ok) void reportRefusal(surface, result.cap);
    return result;
}

async function countHit(cap: Cap): Promise<{ count: number; resetInMs: number } | "unavailable"> {
    if (!isCacheConfigured()) return memory.hit(cap.key, cap.windowMs, Date.now());
    return cacheIncrWindow(cap.key, cap.windowMs);
}

/** Never throws: a failed alert must not fail the request that raised it. */
async function reportRefusal(surface: string, cap: Cap): Promise<void> {
    try {
        if (!(await claimAlertWindow(`rate-limit:alert:${surface}:${cap.name}`, REFUSAL_ALERT_WINDOW_S))) return;
        await sendAdminAlert({
            title: `🚦 Rate limit reached: ${surface}`,
            description:
                `The "${cap.name}" cap of ${surface} refused a request: more than ${cap.max} in ${describeWindow(cap.windowMs)}. ` +
                `Further refusals on this cap are not reported for an hour.`,
            color: 0xffa500,
            fields: [
                { name: "Surface", value: surface, inline: true },
                { name: "Cap", value: `${cap.name}: ${cap.max} in ${describeWindow(cap.windowMs)}`, inline: true },
            ],
        });
    } catch (error) {
        console.error("Rate limit alert failed:", error);
    }
}

async function reportDegraded(surface: string): Promise<void> {
    console.error(`[rate-limit] Valkey did not answer: ${surface} is not rate limited until it does`);
    try {
        if (!(await claimAlertWindow("rate-limit:alert:degraded", DEGRADED_ALERT_WINDOW_S))) return;
        await sendAdminAlert({
            title: "🚦 Rate limiting degraded",
            description:
                `Valkey did not count a request on ${surface}. Requests go through uncounted until it answers. ` +
                `Not reported again for ten minutes.`,
            color: 0xff0000,
            fields: [{ name: "Surface", value: surface, inline: true }],
        });
    } catch (error) {
        console.error("Rate limit alert failed:", error);
    }
}

function describeWindow(windowMs: number): string {
    const minutes = Math.round(windowMs / 60_000);
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return hours === 1 ? "an hour" : `${hours} hours`;
    }
    return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
