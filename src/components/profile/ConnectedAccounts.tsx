"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorLine } from "@/components/ui/error-line";
import { GoogleMark } from "@/components/ui/google-mark";
import { GoogleSignInButton } from "@/components/user/GoogleSignInButton";
import { SettingsCard, SettingsRow, SettingsRows } from "@/components/profile/SettingsChrome";
import { disconnectGoogle } from "@/lib/actions/accounts";
import { authErrorKey } from "@/lib/auth/authErrorKey";

/**
 * The Auth.js error codes a failed Connect comes back with (the sign-in page
 * forwards them here as `?error=`), by message key; see authErrorKey.
 */
const CONNECT_ERROR_KEYS: Record<string, string> = {
    // The Google account is linked to another user already.
    OAuthAccountNotLinked: "connectErrors.alreadyLinked",
    // The signIn callback refused: the Google email is not verified.
    AccessDenied: "connectErrors.accessDenied",
};

/** Back to this tab, on the page's own path so the locale prefix stays. */
async function returnToAccountTab(): Promise<string> {
    return `${window.location.pathname}?tab=account`;
}

/**
 * The OAuth accounts the user can sign in with, one row per provider. Connect
 * runs the provider's sign-in while signed in, which Auth.js turns into a link
 * to this account and brings back to this tab. Disconnect deletes the link;
 * the magic link stays, so the user is never locked out.
 */
export function ConnectedAccounts({ googleLinked }: { googleLinked: boolean }) {
    const t = useTranslations("Profile");
    const router = useRouter();
    const searchParams = useSearchParams();
    // Read once: the code arrives in the URL from the sign-in page, and a
    // reload or a change of user must not show it again. So the URL is
    // rewritten without it as soon as the message is on screen.
    const [connectError] = useState(() => authErrorKey(searchParams.get("error"), CONNECT_ERROR_KEYS, "connectErrors.generic"));
    useEffect(() => {
        if (!connectError) return;
        const url = new URL(window.location.href);
        if (!url.searchParams.has("error")) return;
        url.searchParams.delete("error");
        window.history.replaceState(window.history.state, "", url);
    }, [connectError]);
    const [busy, setBusy] = useState(false);
    // The line under the row: the answer to a Connect that came back, or to
    // a press that failed here. A key under `Profile`.
    const [message, setMessage] = useState<string | null>(connectError);

    async function disconnect() {
        setBusy(true);
        setMessage(null);
        try {
            await disconnectGoogle();
            router.refresh();
        } catch (error) {
            console.error("Failed to disconnect Google:", error);
            setMessage("disconnectError");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SettingsCard title={t("connectedAccounts")} description={t("connectedAccountsDescription")}>
            <SettingsRows>
                <SettingsRow
                    label={
                        <span className="inline-flex items-center gap-2">
                            <GoogleMark className="h-4 w-4" />
                            Google
                        </span>
                    }
                    description={googleLinked ? t("googleLinked") : t("googleNotLinked")}
                    control={
                        googleLinked ? (
                            <Button variant="outline" size="sm" disabled={busy} onClick={disconnect}>
                                {t("disconnect")}
                            </Button>
                        ) : (
                            <GoogleSignInButton
                                redirectTo={returnToAccountTab}
                                label={t("connect")}
                                size="sm"
                                onStart={() => setMessage(null)}
                                onError={() => setMessage("connectErrors.generic")}
                            />
                        )
                    }
                />
            </SettingsRows>
            {message && (
                <div className="px-4 pb-4 sm:px-5">
                    <ErrorLine>{t(message)}</ErrorLine>
                </div>
            )}
        </SettingsCard>
    );
}
