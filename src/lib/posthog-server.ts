import { PostHog } from "posthog-node";
import { env } from "@/env.mjs";

// Cached on globalThis (same pattern as src/lib/db/prisma.ts) so dev
// hot-reload doesn't create a new client and event queue per reload.
const globalForPostHog = globalThis as unknown as {
    posthogServer: PostHog | undefined;
};

/**
 * Server-side PostHog client, or null when no project token is configured
 * (local dev without analytics, CI, contributor setups). Callers must
 * optional-chain: `getPostHogClient()?.capture(...)`.
 *
 * Uses posthog-node's default batching (20 events / 10s), which fits our
 * long-running containers. Events captured in the last few seconds before
 * a hard shutdown can be lost; acceptable for analytics.
 */
export function getPostHogClient(): PostHog | null {
    if (!env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
        return null;
    }
    if (!globalForPostHog.posthogServer) {
        globalForPostHog.posthogServer = new PostHog(env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
            host: env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
        });
    }
    return globalForPostHog.posthogServer;
}
