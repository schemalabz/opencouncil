import { createHmac } from "node:crypto";

/**
 * The pure rules of the rate limiter: what a cap is, when a set of counts
 * refuses, where the client's address is in a request, and how an identity
 * becomes a key. The limiter (limiter.ts) counts; tests need no store.
 */

/** One ceiling on one counter: at most `max` hits per `windowMs`. */
export interface Cap {
    /** What the cap guards, for the refusal and the alert: "address", "ip", "all". */
    name: string;
    /** The counter. Names the surface and the identity: "rate-limit:magic-link:ip:203.0.113.9". */
    key: string;
    max: number;
    windowMs: number;
}

/** A cap with the hits its counter took in the current window, this one included. */
export interface WindowSample {
    cap: Cap;
    count: number;
    /** When the window ends and the count starts over. */
    resetInMs: number;
}

export type Allowance = { ok: true } | { ok: false; cap: Cap; retryAfterMs: number };

/**
 * May the request go on? Every hit is counted before this is asked, the
 * refused ones too, so a cap is full once its count passes its max. The
 * wait a refusal names is the longest among the full caps: when it ends,
 * every one of them has reset.
 */
export function allowance(samples: WindowSample[]): Allowance {
    let refused: { ok: false; cap: Cap; retryAfterMs: number } | null = null;
    for (const sample of samples) {
        if (sample.count <= sample.cap.max) continue;
        const retryAfterMs = Math.max(sample.resetInMs, 1);
        if (!refused || retryAfterMs > refused.retryAfterMs) {
            refused = { ok: false, cap: sample.cap, retryAfterMs };
        }
    }
    return refused ?? { ok: true };
}

/**
 * The address the request came from, or null when no trusted proxy named
 * one. Production runs on DigitalOcean App Platform, whose ingress puts the
 * visitor in `do-connecting-ip` and itself in `x-forwarded-for`. Previews
 * sit behind Caddy, which sets `x-forwarded-for` to the peer it accepted
 * and drops what the peer sent, so the last entry is the client there. A
 * local run has neither, and an IP cap is simply not applied.
 */
export function clientIp(headers: Headers): string | null {
    const direct = headers.get("do-connecting-ip")?.trim();
    if (direct) return plausibleIp(direct);
    const forwarded = headers.get("x-forwarded-for");
    if (!forwarded) return null;
    const entries = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean);
    const last = entries[entries.length - 1];
    return last ? plausibleIp(last) : null;
}

/** Enough of a check to keep a header value out of a key: no spaces, bounded length. */
function plausibleIp(value: string): string | null {
    return /^[0-9a-fA-F:.]{3,45}$/.test(value) ? value : null;
}

/**
 * A key for an identity that is personal data, such as an email address.
 * Keyed, so a dump of the store gives up no address, and the purpose prefix
 * keeps it apart from every other use of the secret.
 */
export function hashIdentifier(secret: string, value: string): string {
    return createHmac("sha256", secret).update(`rate-limit:${value.trim().toLowerCase()}`).digest("hex");
}

/** How many keys the in-process store holds before a hit sweeps the expired ones. */
const SWEEP_ABOVE = 10_000;

/**
 * The counters of one process, for a run without Valkey: a developer's
 * machine or a preview, which are one container, so the count is complete
 * there. Semantics match cacheIncrWindow: a fixed window from the first hit.
 */
export class MemoryWindows {
    private readonly windows = new Map<string, { count: number; resetAt: number }>();

    hit(key: string, windowMs: number, now: number): { count: number; resetInMs: number } {
        const open = this.windows.get(key);
        if (open && open.resetAt > now) {
            open.count += 1;
            return { count: open.count, resetInMs: open.resetAt - now };
        }
        if (this.windows.size >= SWEEP_ABOVE) this.sweep(now);
        this.windows.set(key, { count: 1, resetAt: now + windowMs });
        return { count: 1, resetInMs: windowMs };
    }

    get size(): number {
        return this.windows.size;
    }

    private sweep(now: number): void {
        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(key);
        }
    }
}
