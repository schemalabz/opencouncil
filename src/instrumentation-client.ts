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
        debug: process.env.NODE_ENV === "development",
    });

    // on_reject mode DROPS all events while consent is 'pending' (it only
    // sends for explicit accept or decline). Default to the declined state
    // instead: cookieless tracking via PostHog's server-side daily hash,
    // nothing stored on the device. Visitors who ignore the ConsentChip are
    // then still measured anonymously; accepting upgrades to cookie-based
    // tracking. The chip's own visibility is gated separately (it can't use
    // the 'pending' status, which this call consumes).
    if (posthog.get_explicit_consent_status() === "pending") {
        posthog.opt_out_capturing();
    }
}
