"use server"

import { signIn } from "@/auth"
import { safeRedirectPath } from "@/lib/safeRedirect"
import { signInFailurePath } from "@/lib/auth/signInResult"

export async function signInWithEmail(formData: FormData): Promise<string> {
    const email = formData.get("email")
    const redirectTo = safeRedirectPath(formData.get("callbackUrl"))
    console.log(`Sign-in requested (redirectTo: ${redirectTo})`)
    // redirect: false — with the default, Auth.js finishes by throwing Next's
    // NEXT_REDIRECT through the caller's await, and the sign-in form reported
    // every successful request as an error. Instead, return the verify-request
    // URL and let the caller navigate to it.
    const url: string = await signIn("resend", { email, redirectTo, redirect: false })
    // Auth.js rethrows AuthError instances on its own; every other failure
    // comes back as an error URL (see signInFailurePath). Throw so the form
    // shows its error state instead of navigating there.
    const failurePath = signInFailurePath(url)
    if (failurePath) {
        throw new Error(`Sign-in did not complete (redirected to ${failurePath})`)
    }
    return url
}
