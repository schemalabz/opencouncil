import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { sendEmail } from "@/lib/email/resend"
import { renderAsync } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { NextResponse } from "next/server"
import { env } from '@/env.mjs'

export async function POST(
    request: Request,
    { params }: { params: { userId: string } }
) {
    const currentUser = await getCurrentUser()
    if (!currentUser?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: params.userId }
        })

        if (!user) {
            return new NextResponse("User not found", { status: 404 })
        }

        // Send email with simple sign in link
        const signInUrl = `${env.NEXTAUTH_URL}/sign-in?email=${user.email}`

        const emailHtml = await renderAsync(UserInviteEmail({
            name: user.name || user.email,
            inviteUrl: signInUrl
        }))

        await sendEmail({
            from: "OpenCouncil <auth@opencouncil.gr>",
            to: user.email,
            subject: "Πρόσκληση: Συνδεθείτε στο OpenCouncil",
            html: emailHtml,
        })

        return new NextResponse("Invite sent successfully", { status: 200 })
    } catch (error) {
        console.error("Failed to resend invite:", error)
        return new NextResponse("Failed to resend invite", { status: 500 })
    }
}