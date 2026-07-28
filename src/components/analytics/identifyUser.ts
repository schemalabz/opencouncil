import posthog from "posthog-js";
import type { Session } from "next-auth";
import { INTERNAL_PERSON_KEY, INTERNAL_USER_KEY } from "@/lib/utils/analyticsConsent";

// posthog-js's cookieless sentinel distinct id (not exported publicly).
// While in cookieless mode, EVERY visitor shares this value as their
// distinct id.
const COOKIELESS_SENTINEL = "$posthog_cookieless";

// Team traffic on production can't be excluded by host filters, and person
// filters can't see logged-out or cookieless visits. Instead, any device
// that ever holds a team session is marked permanently; all its later events
// carry `internal_user: true` (registered in instrumentation-client on every
// load, and immediately below on the visit that marks the device), which the
// project's "filter internal and test users" setting excludes.
function isTeamMember(session: Session): boolean {
    return !!session.user?.isSuperAdmin || !!session.user?.email?.endsWith("@opencouncil.gr");
}

// Links the PostHog person to the authenticated user. Keyed on the stable
// user id (never on user-typed input like the sign-in email field, which is
// unverified and would let anyone pollute another person's profile).
//
// PostHog only honors identify() once the visitor has granted analytics
// consent; while consent is pending or declined it runs in cookieless mode,
// where everyone is anonymous by design.
export function identifyPostHogUser(session: Session | null) {
    if (!posthog.__loaded) return;
    if (session?.user && isTeamMember(session) && localStorage.getItem(INTERNAL_USER_KEY) !== "1") {
        localStorage.setItem(INTERNAL_USER_KEY, "1");
        posthog.register({ internal_user: true });
    }
    if (posthog.get_explicit_consent_status() !== "granted") return;
    // Consent status lives in localStorage and is shared across tabs, but
    // cookieless mode is per-tab runtime state: a tab still running
    // cookieless can observe "granted" (set by another tab, with this one
    // re-triggered by a session refetch). identify() would then alias the
    // account to the shared sentinel distinct id, merging every user who
    // ever hits this path into one PostHog person. Skip instead: this tab
    // keeps capturing anonymously, and identify happens on the next cookied
    // page load.
    if (posthog.get_distinct_id() === COOKIELESS_SENTINEL) return;
    if (session?.user?.id) {
        // Deliberately no person properties: the id alone is enough to link
        // events to the account, keeps direct PII (email) out of PostHog, and
        // avoids the billable $set that identify() emits on every page load
        // when properties are passed for an already-identified person.
        posthog.identify(session.user.id);
        if (isTeamMember(session) && localStorage.getItem(INTERNAL_PERSON_KEY) !== session.user.id) {
            localStorage.setItem(INTERNAL_PERSON_KEY, session.user.id);
            // Person-level backstop to the device stamp above: events sent
            // from a fresh device before the first team sign-in carry no
            // `internal_user`, but this property puts the person in the
            // internal-users cohort, whose project filter excludes all their
            // events at query time — including those unstamped ones.
            posthog.setPersonProperties({ $internal_or_test_user: true });
        }
    }
}
