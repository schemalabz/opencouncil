"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { EMBED_PATH } from "@/lib/utils/embed";

// Captures $pageview manually (automatic capture is disabled in
// instrumentation-client.ts) so that every pageview carries `logged_in`.
// The automatic pageview fires before the session is known, and a landing
// pageview without that property would make it impossible for funnels to
// segment signed-in vs anonymous visitors at their entry point.
//
// Uses next/navigation hooks (not next-intl's) because this renders in the
// root layout, which also wraps /_not-found — see PlausibleAnalytics.
export default function PostHogPageView() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { status } = useSession();
    const lastUrl = useRef<string | null>(null);

    useEffect(() => {
        // EMBED_PATH: init-time exclusion covers embeds loaded as documents
        // (iframes), but client-side navigation onto an embed route keeps
        // posthog alive — don't count those as pageviews either.
        if (!posthog.__loaded || status === "loading" || !pathname || EMBED_PATH.test(pathname)) return;

        const search = searchParams?.toString();
        const url = window.origin + pathname + (search ? `?${search}` : "");
        // Session refetches re-run this effect for the same URL; don't re-fire.
        if (url === lastUrl.current) return;
        lastUrl.current = url;

        posthog.capture("$pageview", {
            $current_url: url,
            logged_in: status === "authenticated",
        });
    }, [pathname, searchParams, status]);

    return null;
}
