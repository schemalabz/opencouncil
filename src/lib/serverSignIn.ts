"use server"

import { signIn } from "@/auth"
import { safeRedirectPath } from "@/lib/safeRedirect"

export async function signInWithEmail(formData: FormData) {
    const email = formData.get("email")
    const redirectTo = safeRedirectPath(formData.get("callbackUrl"))
    console.log(`Sign-in requested (redirectTo: ${redirectTo})`)
    await signIn("resend", { email, redirectTo })
}
