"use server"

import { signIn } from "@/auth"

export async function signInWithEmail(formData: FormData) {
    const email = formData.get("email")
    await signIn("resend", { email }, { redirectTo: "/profile" })
}