import { SignIn } from "@/components/user/sign-in"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
// The locale-aware redirect: next/navigation's would send a bare "/profile",
// dropping the locale prefix and landing the reader on the Greek page.
import { redirect as redirectWithLocale } from "@/i18n/routing"
import { safeRedirectPath } from "@/lib/safeRedirect"
import { isTrustedExternalRedirect } from "@/lib/auth/trustedRedirect"
import { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { googleSignInAvailable } from "@/lib/auth/googleSignIn"
import { callbackUrlCookieName } from "@/lib/auth/sessionMirror"
import { storedCallbackUrl } from "@/lib/auth/storedCallbackUrl"
import { env } from "@/env.mjs"
import { firstSearchParam } from "@/lib/utils/searchParams"

// Auth entry point — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function SignInPage(
    props: {
        searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>
    }
) {
    const searchParams = await props.searchParams;
    const session = await auth()
    // Auth.js sends every failure here (pages.error), with the code in `error`.
    const errorCode = firstSearchParam(searchParams.error) || null

    if (session) {
        // A signed-in user only gets here on a failed Connect from the profile
        // (a Google account that belongs to another user, an unverified
        // email). The card they pressed is where the answer belongs.
        if (errorCode) {
            redirectWithLocale({ href: `/profile?tab=account&error=${encodeURIComponent(errorCode)}`, locale: await getLocale() })
        }
        const raw = firstSearchParam(searchParams.callbackUrl) || null
        // Absolute targets are allowed only for the trusted hosts (realm
        // apexes, the Notis admin) — same policy as the Auth.js redirect
        // callback, which covers the magic-link completion path.
        if (raw && isTrustedExternalRedirect(raw)) {
            redirect(raw)
        }
        redirect(safeRedirectPath(raw))
    }

    let callbackUrl = firstSearchParam(searchParams.callbackUrl) || null
    // An error redirect carries no callbackUrl, but Auth.js kept the one the
    // attempt started with in its callback-url cookie. Take it back, so a
    // retry after an expired link still lands where the reader was going.
    if (!callbackUrl && errorCode) {
        callbackUrl = storedCallbackUrl((await cookies()).get(callbackUrlCookieName())?.value, env.NEXTAUTH_URL)
    }
    const googleAvailable = googleSignInAvailable(await headers())

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
            <SignIn googleAvailable={googleAvailable} callbackUrl={callbackUrl} />
        </div>
    )
}
