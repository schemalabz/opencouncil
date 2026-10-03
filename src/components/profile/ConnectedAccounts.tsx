"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useBfcacheRestore } from "@/hooks/useBfcacheRestore";
import { Button } from "@/components/ui/button";
import { ErrorLine } from "@/components/ui/error-line";
import { GoogleMark } from "@/components/ui/google-mark";
import { SettingsCard, SettingsRow, SettingsRows } from "@/components/profile/SettingsChrome";
import { disconnectGoogle } from "@/lib/actions/accounts";

/**
 * Why a Connect came back without a link, by the Auth.js error code the
 * sign-in page forwards here (`?error=`). Anything else is the generic one.
 */
const CONNECT_ERROR_KEYS: Record<string, string> = {
    // The Google account is linked to another user already.
    OAuthAccountNotLinked: "connectErrors.alreadyLinked",
    // The signIn callback refused: the Google email is not verified.
    AccessDenied: "connectErrors.accessDenied",
};

function connectErrorKey(code: string | null): string | null {
    if (!code) return null;
    return Object.hasOwn(CONNECT_ERROR_KEYS, code) ? CONNECT_ERROR_KEYS[code] : "connectErrors.generic";
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
    const [connectError] = useState(() => connectErrorKey(searchParams.get("error")));
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
    // Back from Google restores this page with busy still true.
    useBfcacheRestore(() => setBusy(false));

    async function connect() {
        setBusy(true);
        setMessage(null);
        try {
            // Back to this tab, on the page's own path so the locale prefix stays.
            await signIn("google", { redirectTo: `${window.location.pathname}?tab=account` });
        } catch (error) {
            // The request that starts the flow failed; nothing navigated, so
            // the button comes back with a reason.
            console.error("Google connect did not start:", error);
            setMessage("connectErrors.generic");
            setBusy(false);
        }
    }

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
                            <Button variant="outline" size="sm" disabled={busy} onClick={connect}>
                                {t("connect")}
                            </Button>
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
