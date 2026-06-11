"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { identifyPostHogUser } from "./identifyUser";

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
        }
    }, [session, status]);

    return null;
}
