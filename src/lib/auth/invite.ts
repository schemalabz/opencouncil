import { randomBytes } from "crypto"
import { render } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { sendEmail } from "@/lib/email/resend"
import { env } from "@/env.mjs"
import prisma from "@/lib/db/prisma"

export async function generateSignInLink(email: string): Promise<{ signInUrl: string, verificationTokenKey: { identifier: string, token: string } }> {
    const token = randomBytes(32).toString('hex')

    await prisma.verificationToken.create({
        data: {
            identifier: email,
            token,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    })

    const signInUrl = `${env.NEXTAUTH_URL}/sign-in?token=${token}&email=${encodeURIComponent(email)}`
    return {
        signInUrl,
        verificationTokenKey: {
            identifier: email,
            token,
        }
    }
}

export async function sendInviteEmail(email: string, name: string | null | undefined): Promise<boolean> {
    let verificationTokenKey: { identifier: string; token: string } | undefined
    try {
        const result = await generateSignInLink(email)
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
