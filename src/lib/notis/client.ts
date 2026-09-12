import "server-only";

import { env } from "@/env.mjs";

/**
 * The main app's client for the Notis subscriptions API — the one place that
 * answers "is this reader subscribed" and the one place that flips it. Notis
 * owns the status; this app asks for a state on the reader's explicit action
 * (the profile switch, the signup's delivery step).
 *
 * Server-side only, with the shared service token: the browser is not a
 * party to these calls, and the session-mirror cookie cannot ride a
 * cross-origin fetch anyway. Never throws — every failure is a value the
 * caller can degrade on, because the switch must keep working when Notis is
 * unreachable or, in development, not configured at all.
 */

export type NotisSubscriptionStatus = "active" | "unsubscribed";

export interface NotisSubscriptionView {
    status: NotisSubscriptionStatus;
    phone: string | null;
    origin: string;
    unsubscribedAt: string | null;
    createdAt: string;
}

export type NotisClientResult<T> =
    | { ok: true; data: T }
    | { ok: false; reason: "unconfigured" | "unreachable" }
    | { ok: false; reason: "rejected"; status: number; code: string | null };

const TIMEOUT_MS = 4000;

export function isNotisConfigured(): boolean {
    return Boolean(env.NOTIS_API_URL && env.NOTIS_SERVICE_TOKEN);
}

async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<NotisClientResult<T>> {
    if (!env.NOTIS_API_URL || !env.NOTIS_SERVICE_TOKEN) return { ok: false, reason: "unconfigured" };
    try {
        const response = await fetch(new URL(path, env.NOTIS_API_URL), {
            method: init.method,
            headers: {
                authorization: `Bearer ${env.NOTIS_SERVICE_TOKEN}`,
                ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
            },
            ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
            const code = typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
                ? (body as { error: string }).error
                : null;
            return { ok: false, reason: "rejected", status: response.status, code };
        }
        return { ok: true, data: body as T };
    } catch (error) {
        console.error(`Notis ${init.method} ${path} failed:`, error instanceof Error ? error.message : error);
        return { ok: false, reason: "unreachable" };
    }
}

const subscriptionPath = (userId: string) => `/api/subscriptions/${encodeURIComponent(userId)}`;

export async function getNotisSubscription(
    userId: string,
): Promise<NotisClientResult<NotisSubscriptionView | null>> {
    const result = await call<{ subscription: NotisSubscriptionView | null } | null>(subscriptionPath(userId), { method: "GET" });
    // `call` hands back a null body for a 2xx that is not the API's JSON — a
    // 204, or a proxy's HTML error page. Reading through it would throw out of
    // a function every caller trusts never to throw.
    return result.ok ? { ok: true, data: result.data?.subscription ?? null } : result;
}

export async function setNotisSubscription(
    userId: string,
    status: NotisSubscriptionStatus,
): Promise<NotisClientResult<{ subscription: NotisSubscriptionView | null; next?: "poller" }>> {
    const result = await call<{ subscription: NotisSubscriptionView | null; next?: "poller" } | null>(
        subscriptionPath(userId),
        { method: "PATCH", body: { status } },
    );
    return result.ok ? { ok: true, data: result.data ?? { subscription: null } } : result;
}
