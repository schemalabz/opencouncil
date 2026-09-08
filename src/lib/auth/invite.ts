import { randomBytes } from "crypto"
import { render } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { sendEmail } from "@/lib/email/resend"
import { env } from "@/env.mjs"
import prisma from "@/lib/db/prisma"
import { signInUrlForRequest } from "@/lib/auth/signInUrl"

/**
 * `request` repoints the link at the host the admin is inviting from, as
 * `auth.config.ts` does for the magic link: production session cookies are
 * host-only, so an invite landing on another domain signs the person in there.
 *
 * The admin's host, deliberately — not the realm of the city they will
 * administer. Omit `request` to keep the configured host.
 */
export async function generateSignInLink(email: string, request?: Request): Promise<{ signInUrl: string, verificationTokenKey: { identifier: string, token: string } }> {
    const token = randomBytes(32).toString('hex')

    await prisma.verificationToken.create({
        data: {
            identifier: email,
            token,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    })

    const configuredUrl = `${env.NEXTAUTH_URL}/sign-in?token=${token}&email=${encodeURIComponent(email)}`
    // signInUrlForRequest trusts only a host isKnownRealmHost recognises, so a
    // spoofed Host cannot move the invite.
    const signInUrl = request ? signInUrlForRequest(configuredUrl, request) : configuredUrl
    return {
        signInUrl,
        verificationTokenKey: {
            identifier: email,
            token,
        }
    }
}

export async function sendInviteEmail(email: string, name: string | null | undefined, request?: Request): Promise<boolean> {
    let verificationTokenKey: { identifier: string; token: string } | undefined
    try {
        const result = await generateSignInLink(email, request)
        verificationTokenKey = result.verificationTokenKey
        const emailHtml = await render(UserInviteEmail({ name: name || email, inviteUrl: result.signInUrl }))
        const sendResult = await sendEmail({
            from: "OpenCouncil <auth@opencouncil.gr>",
            to: email,
            subject: "Πρόσκληση: Συνδεθείτε στο OpenCouncil",
            html: emailHtml,
        })
        if (!sendResult.success) throw new Error("Email send failed")
        return true
    } catch (error) {
        console.error("Failed to send invite email:", error)
        if (verificationTokenKey) {
            try {
                await prisma.verificationToken.deleteMany({ where: verificationTokenKey })
            } catch (cleanupError) {
                console.error("Failed to clean up verification token:", cleanupError)
            }
        }
        return false
    }
}
