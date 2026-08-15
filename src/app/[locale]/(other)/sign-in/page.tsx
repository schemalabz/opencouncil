import { SignIn } from "@/components/user/sign-in"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { safeRedirectPath } from "@/lib/safeRedirect"
import { isTrustedExternalRedirect } from "@/lib/auth/trustedRedirect"
import { Metadata } from "next"

// Auth entry point — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function SignInPage(
    props: {
        searchParams: Promise<{ callbackUrl?: string | string[] }>
    }
) {
    const searchParams = await props.searchParams;
    const session = await auth()

    if (session) {
        const raw = Array.isArray(searchParams.callbackUrl) ? searchParams.callbackUrl[0] : searchParams.callbackUrl
        // Absolute targets are allowed only for the trusted hosts (realm
        // apexes, the Notis admin) — same policy as the Auth.js redirect
        // callback, which covers the magic-link completion path.
        if (raw && isTrustedExternalRedirect(raw)) {
            redirect(raw)
        }
        redirect(safeRedirectPath(raw))
    }

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
            <SignIn />
        </div>
    )
}
