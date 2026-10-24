"use server"

import { signIn } from "@/auth"
import { safeRedirectPath } from "@/lib/safeRedirect"
import { signInFailurePath } from "@/lib/auth/signInResult"
import { isUserOnboardedByEmail } from "@/lib/db/users"

export async function signInWithEmail(formData: FormData): Promise<void> {
    const rawEmail = formData.get("email")
    if (typeof rawEmail !== "string" || !rawEmail.trim()) {
        throw new Error("Email is required")
    }

    const email = rawEmail.toLowerCase().trim()

    // Check if the user already exists and has completed onboarding via centralized DB helper
    const isOnboarded = await isUserOnboardedByEmail(email)
    const fallback = isOnboarded ? "/" : "/profile"
    const redirectTo = safeRedirectPath(formData.get("callbackUrl"), fallback)
    console.log(`Sign-in requested (redirectTo: ${redirectTo})`)

    // redirect: false — with the default, Auth.js finishes by throwing Next's
    // NEXT_REDIRECT through the caller's await, and the sign-in form reported
    // every successful request as an error. The caller shows its own
    // "check your email" state instead of Auth.js's verify-request page.
    const url: string = await signIn("resend", { email, redirectTo, redirect: false })
    // Auth.js rethrows AuthError instances on its own; every other failure
    // comes back as an error URL (see signInFailurePath). Throw so the form
    // shows its error state instead of navigating there.
    const failurePath = signInFailurePath(url)
    if (failurePath) {
        throw new Error(`Sign-in did not complete (redirected to ${failurePath})`)
    }
}
