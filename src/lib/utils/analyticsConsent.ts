import posthog from "posthog-js";

// The visitor's explicit ConsentChip answer ("accepted" | "declined").
// Kept separately from PostHog's own consent storage because posthog.reset()
// (e.g. on sign-out) clears the latter back to 'pending'.
export const ANALYTICS_CHOICE_KEY = "oc-analytics-choice";

// Re-opens the ConsentChip (e.g. from the footer's cookie-preferences link)
// so consent can be withdrawn or changed as easily as it was given.
export const REOPEN_CONSENT_EVENT = "oc-reopen-cookie-consent";

// Re-applies the stored ConsentChip answer whenever PostHog's own consent
// state is back to 'pending' — on initial load, and right after
// posthog.reset() on sign-out. In on_reject mode 'pending' DROPS all events,
// so some explicit state must always be set: "accepted" restores opt-in,
// anything else stays on the cookieless declined default (server-side daily
// hash, nothing stored on the device).
export function applyStoredAnalyticsConsent() {
    if (!posthog.__loaded) return;
    if (posthog.get_explicit_consent_status() !== "pending") return;
    if (localStorage.getItem(ANALYTICS_CHOICE_KEY) === "accepted") {
        // A restore of an earlier choice, not a new consent action: don't
        // emit the default $opt_in event.
        posthog.opt_in_capturing({ captureEventName: null });
    } else {
        posthog.opt_out_capturing();
    }
}
