import posthog from "posthog-js";
import type { Session } from "next-auth";

// Links the PostHog person to the authenticated user. Keyed on the stable
// user id (never on user-typed input like the sign-in email field, which is
// unverified and would let anyone pollute another person's profile).
//
// PostHog only honors identify() once the visitor has granted analytics
// consent; while consent is pending or declined it runs in cookieless mode,
// where everyone is anonymous by design.
export function identifyPostHogUser(session: Session | null) {
    if (!posthog.__loaded) return;
    if (posthog.get_explicit_consent_status() !== "granted") return;
    if (session?.user?.id) {
        // Deliberately no person properties: the id alone is enough to link
        // events to the account, keeps direct PII (email) out of PostHog, and
        // avoids the billable $set that identify() emits on every page load
        // when properties are passed for an already-identified person.
        posthog.identify(session.user.id);
    }
}
