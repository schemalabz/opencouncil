"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { identifyPostHogUser } from "./identifyUser";
import { applyStoredAnalyticsConsent } from "@/lib/utils/analyticsConsent";

// Keeps PostHog identity in sync with the auth session: identifies
// consenting signed-in users on their user id, resets the person on
// sign-out, and registers `logged_in` as a super property so custom
// events (search, chat, signup) carry it too.
export default function PostHogAuthSync() {
    const { data: session, status } = useSession();
    const wasAuthenticated = useRef(false);

    useEffect(() => {
        if (!posthog.__loaded || status === "loading") return;

        posthog.register({ logged_in: status === "authenticated" });

        if (status === "authenticated") {
            wasAuthenticated.current = true;
            identifyPostHogUser(session);
        } else if (wasAuthenticated.current) {
            wasAuthenticated.current = false;
            posthog.reset();
            // reset() clears PostHog's consent storage back to 'pending',
            // which in on_reject mode drops all events. Re-apply the stored
            // chip answer immediately — not just on the next full page load.
            applyStoredAnalyticsConsent();
        }
    }, [session, status]);

    return null;
}
