"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { identifyPostHogUser } from "./identifyUser";

// Re-opens the chip (e.g. from the footer's "cookie preferences" link) so
// consent can be withdrawn or changed as easily as it was given.
export const REOPEN_CONSENT_EVENT = "oc-reopen-cookie-consent";

// Tracks whether the visitor has explicitly answered the chip. PostHog's own
// consent status can't gate visibility: instrumentation-client defaults
// undecided visitors to the declined (cookieless) state, because posthog-js
// drops all events while consent is 'pending'.
const CHOICE_KEY = "oc-analytics-choice";

// Deliberately ignorable consent chip: until a choice is made, PostHog runs
// in cookieless mode (nothing stored on the device), so dismissal or
// indifference costs us nothing but cross-visit identity. Both choices are
// one click at the same level, as the HDPA cookie guidelines require.
export default function ConsentChip() {
    const [visible, setVisible] = useState(false);
    const { data: session } = useSession();
    const t = useTranslations("CookieConsent");

    useEffect(() => {
        // posthog only initializes with a token and outside embeds; the chip
        // follows the same gate and only shows while no choice has been made.
        if (posthog.__loaded && !localStorage.getItem(CHOICE_KEY)) {
            setVisible(true);
        }

        const reopen = () => {
            if (posthog.__loaded) setVisible(true);
        };
        window.addEventListener(REOPEN_CONSENT_EVENT, reopen);
        return () => window.removeEventListener(REOPEN_CONSENT_EVENT, reopen);
    }, []);

    if (!visible) return null;

    const choose = (accepted: boolean) => {
        if (accepted) {
            posthog.opt_in_capturing();
            identifyPostHogUser(session);
            // The current page was viewed under the cookieless identity (or
            // before it); re-capture it under the new cookied person so
            // funnels starting on this page keep their first step.
            posthog.capture("$pageview", {
                $current_url: window.location.href,
                logged_in: !!session?.user,
            });
        } else {
            posthog.opt_out_capturing();
        }
        localStorage.setItem(CHOICE_KEY, accepted ? "accepted" : "declined");
        setVisible(false);
    };

    return (
        <aside
            aria-label={t("title")}
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 sm:max-w-sm z-50 rounded-xl border bg-background/90 backdrop-blur shadow-lg p-4 animate-in slide-in-from-bottom-4 fade-in duration-500"
        >
            <div className="flex items-start gap-3">
                <Cookie className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("message")}{" "}
                        <Link
                            href="/privacy"
                            className="underline underline-offset-2 hover:text-foreground"
                        >
                            {t("learnMore")}
                        </Link>
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => choose(true)}>
                            {t("accept")}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs"
                            onClick={() => choose(false)}
                        >
                            {t("decline")}
                        </Button>
                    </div>
                </div>
            </div>
        </aside>
    );
}
