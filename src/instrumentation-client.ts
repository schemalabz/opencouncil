import posthog from "posthog-js";
import { env } from "@/env.mjs";
import { EMBED_PATH } from "@/lib/utils/embed";

// Without a token (contributor setups, CI), analytics stays fully disabled.
// Embed routes are excluded like in PlausibleAnalytics: they load inside
// iframes on third-party sites.
if (env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && !EMBED_PATH.test(window.location.pathname)) {
    posthog.init(env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
        api_host: "/ingest",
        ui_host: "https://eu.posthog.com",
        defaults: "2026-01-30",
        capture_exceptions: true,
        debug: process.env.NODE_ENV === "development",
    });
}
