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
        posthog.identify(session.user.id, { email: session.user.email ?? undefined });
    }
}
