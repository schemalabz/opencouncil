// The visitor's explicit ConsentChip answer ("accepted" | "declined").
// Kept separately from PostHog's own consent storage because posthog.reset()
// (e.g. on sign-out) clears the latter back to 'pending';
// instrumentation-client re-applies the stored choice at init so an accepted
// visitor isn't silently downgraded to cookieless tracking.
export const ANALYTICS_CHOICE_KEY = "oc-analytics-choice";

// Re-opens the ConsentChip (e.g. from the footer's cookie-preferences link)
// so consent can be withdrawn or changed as easily as it was given.
export const REOPEN_CONSENT_EVENT = "oc-reopen-cookie-consent";
