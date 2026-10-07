"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/ui/google-mark";
import { useBfcacheRestore } from "@/hooks/useBfcacheRestore";
import { cn } from "@/lib/utils";

/**
 * "Continue with Google", wherever a reader may sign in: the sign-in card,
 * the account fields of a signup, the QR join. `redirectTo` is where the
 * sign-in lands, or a function that builds it first (the QR join mints a
 * signed return path on the server). A null from that function abandons
 * the click; the caller has shown why.
 */
export function GoogleSignInButton({
    redirectTo,
    label,
    disabled = false,
    size,
    onStart,
    onError,
    className,
}: {
    redirectTo: string | (() => Promise<string | null>);
    label: string;
    disabled?: boolean;
    size?: "default" | "sm" | "lg";
    /** Runs on the click, before anything leaves the page: analytics, clearing an error. */
    onStart?: () => void;
    /** Runs when the flow did not start (offline, server down); the button is back by then. */
    onError?: () => void;
    className?: string;
}) {
    const [busy, setBusy] = useState(false);
    // Back from Google restores this page with busy still true.
    useBfcacheRestore(() => setBusy(false));

    async function start() {
        setBusy(true);
        onStart?.();
        try {
            const target = typeof redirectTo === "string" ? redirectTo : await redirectTo();
            if (target === null) {
                setBusy(false);
                return;
            }
            await signIn("google", { redirectTo: target });
        } catch (error) {
            // The request that starts the flow failed (offline, server down).
            // Nothing navigated, so the button must come back for a retry.
            console.error("Google sign-in did not start:", error);
            setBusy(false);
            onError?.();
        }
    }

    return (
        <Button type="button" variant="outline" size={size} className={cn("gap-2.5", size ? undefined : "w-full", className)} disabled={disabled || busy} onClick={start}>
            <GoogleMark className="h-4 w-4" />
            {label}
        </Button>
    );
}
