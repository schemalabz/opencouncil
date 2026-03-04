import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { sendEmail } from "@/lib/email/resend"
import { render } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { env } from "@/env.mjs"
import { createUser, getUsers, updateUser } from "@/lib/db/users"
import { sendUserOnboardedAdminAlert } from "@/lib/discord"
import { handleApiError } from "@/lib/api/errors"

async function generateSignInLink(email: string): Promise<{ signInUrl: string, verificationTokenKey: { identifier: string, token: string } }> {
    // Create a token that expires in 24 hours
    const token = createHash('sha256')
        .update(email + Date.now().toString())
        .digest('hex')

    // Save the token in the database
    await prisma.verificationToken.create({
        data: {
            identifier: email,
            token,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    })

    // Generate the sign-in URL
    const signInUrl = `${env.NEXTAUTH_URL}/sign-in?token=${token}&email=${encodeURIComponent(email)}`
    return {
        signInUrl,
        verificationTokenKey: {
            identifier: email,
            token,
        }
    }
}

async function sendInviteEmail(email: string, name: string) {
    let verificationTokenKey: { identifier: string, token: string } | undefined
    try {
        const signInLink = await generateSignInLink(email)
        verificationTokenKey = signInLink.verificationTokenKey
        const emailHtml = await render(UserInviteEmail({ name: name || email, inviteUrl: signInLink.signInUrl }))
        const sendResult = await sendEmail({
            from: "OpenCouncil <auth@opencouncil.gr>",
            to: email,
            subject: "You've been invited to OpenCouncil",
            html: emailHtml,
        })
        if (!sendResult.success) throw new Error("Email send failed")
        return true
    } catch (error) {
        console.error("Failed to send invite email:", error)
        if (verificationTokenKey) {
            try { await prisma.verificationToken.deleteMany({ where: verificationTokenKey }) } catch { }
        }
        return false
    }
}

export async function GET() {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const users = await getUsers()
        return NextResponse.json(users)
    } catch (error) {
        console.error("Failed to fetch users:", error)
        return new NextResponse("Failed to fetch users", { status: 500 })
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const data = await request.json()
    const { email, name, isSuperAdmin, administers } = data

    try {
        const newUser = await createUser({ email, name, isSuperAdmin, administers })

        // Send invitation email
        const inviteEmailSent = await sendInviteEmail(newUser.email, newUser.name ?? newUser.email)

        // Send Discord admin alert for admin invite
        sendUserOnboardedAdminAlert({
            cityName: isSuperAdmin ? 'Super Admin' : 'Admin User',
            onboardingSource: 'admin_invite',
        });

        if (!inviteEmailSent) {
            console.error(`User ${newUser.id} created, but invite email failed to send`)
            return NextResponse.json(
                { ...newUser, warning: "User created but invite email could not be sent." },
                { status: 207 }
            )
        }

        return NextResponse.json(newUser)
    } catch (error) {
        return handleApiError(error, "Failed to create user")
    }
}

export async function PUT(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const data = await request.json()
    const { id, email, name, isSuperAdmin, administers } = data

    try {
        const updatedUser = await updateUser(id, { email, name, isSuperAdmin, administers })
        return NextResponse.json(updatedUser)
    } catch (error) {
        return handleApiError(error, "Failed to update user")
    }
}
