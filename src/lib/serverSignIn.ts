"use server"

import { signIn } from "@/auth"
import { safeRedirectPath } from "@/lib/safeRedirect"
import { rateLimitedRetryAfterMs, signInFailurePath } from "@/lib/auth/signInResult"

export type SignInWithEmailResult =
    | { ok: true }
    /** The magic-link rate limit refused the send; `retryAfterMs` is the wait. */
    | { ok: false; reason: "rate_limited"; retryAfterMs: number }

/**
 * Request a magic link. A refusal by the rate limit comes back as a result,
 * so the form can name the wait: a thrown error reaches the browser with its
 * message stripped in production. Every other failure throws.
 */
export async function signInWithEmail(formData: FormData): Promise<SignInWithEmailResult> {
    const email = formData.get("email")
    const redirectTo = safeRedirectPath(formData.get("callbackUrl"))
    console.log(`Sign-in requested (redirectTo: ${redirectTo})`)
    // redirect: false — with the default, Auth.js finishes by throwing Next's
    // NEXT_REDIRECT through the caller's await, and the sign-in form reported
    // every successful request as an error. The caller shows its own
    // "check your email" state instead of Auth.js's verify-request page.
    const url: string = await signIn("resend", { email, redirectTo, redirect: false })
    const retryAfterMs = rateLimitedRetryAfterMs(url)
    if (retryAfterMs !== null) return { ok: false, reason: "rate_limited", retryAfterMs }
    // Auth.js rethrows AuthError instances on its own; every other failure
    // comes back as an error URL (see signInFailurePath). Throw so the form
    // shows its error state instead of navigating there.
    const failurePath = signInFailurePath(url)
    if (failurePath) {
        throw new Error(`Sign-in did not complete (redirected to ${failurePath})`)
    }
    return { ok: true }
}
