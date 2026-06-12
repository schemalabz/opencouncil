import posthog from "posthog-js";
import { env } from "@/env.mjs";
import { EMBED_PATH } from "@/lib/utils/embed";
import { applyStoredAnalyticsConsent } from "@/lib/utils/analyticsConsent";

// Without a token (contributor setups, CI), analytics stays fully disabled.
// Embed routes are excluded like in PlausibleAnalytics: they load inside
// iframes on third-party sites.
if (env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && !EMBED_PATH.test(window.location.pathname)) {
    posthog.init(env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
        api_host: "/ingest",
        ui_host: "https://eu.posthog.com",
        defaults: "2026-01-30",
        capture_exceptions: true,
        // Replay captures rendered page content (profile data, configured
        // locations, etc.), which our privacy policy doesn't disclose. Keep
        // it off in code regardless of the PostHog project setting; enabling
        // it later requires a policy update first.
        disable_session_recording: true,
        // No device storage until the ConsentChip choice: pending or declined
        // visitors are tracked via PostHog's cookieless daily-hash mode, so no
        // banner wall is needed and the privacy policy's cookie section holds.
        cookieless_mode: "on_reject",
        // Pageviews are captured by PostHogPageView so they carry `logged_in`;
        // the automatic capture would fire before the session is known.
        capture_pageview: false,
        // The default ('if_capture_pageview') disables pageleave when
        // capture_pageview is false, but manual $pageview captures still feed
        // the page-view state that $pageleave reads, so automatic pageleave
        // works fine alongside PostHogPageView. Without it, bounce rate and
        // session duration in Web Analytics are inaccurate.
        capture_pageleave: true,
        debug: process.env.NODE_ENV === "development",
    });

    // Visitors who ignore the ConsentChip are measured anonymously
    // (cookieless declined default); accepting upgrades to cookie-based
    // tracking. The chip's own visibility is gated on ANALYTICS_CHOICE_KEY,
    // since this call consumes PostHog's 'pending' status.
    applyStoredAnalyticsConsent();
}
