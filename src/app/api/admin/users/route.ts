import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { sendEmail } from "@/lib/email/resend"
import { renderAsync } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { env } from "@/env.mjs"
import { createUser, getUsers, updateUser } from "@/lib/db/users"
import { sendUserOnboardedAdminAlert } from "@/lib/discord"

async function generateSignInLink(email: string) {
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
    const signInUrl = `${env.NEXT_PUBLIC_BASE_URL}/sign-in?token=${token}&email=${encodeURIComponent(email)}`
    return signInUrl
}

async function sendInviteEmail(email: string, name: string) {
    const signInUrl = await generateSignInLink(email)
    const emailHtml = await renderAsync(UserInviteEmail({
        name: name || email,
        inviteUrl: signInUrl
    }))

    await sendEmail({
        from: "OpenCouncil <auth@opencouncil.gr>",
        to: email,
        subject: "You've been invited to OpenCouncil",
        html: emailHtml,
    })
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
        await sendInviteEmail(email, name)

        // Send Discord admin alert for admin invite
        sendUserOnboardedAdminAlert({
            cityName: isSuperAdmin ? 'Super Admin' : 'Admin User',
            onboardingSource: 'admin_invite',
        });

        return NextResponse.json(newUser)
    } catch (error) {
        console.error("Failed to create user:", error)
        return new NextResponse("Failed to create user", { status: 500 })
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
        console.error("Failed to update user:", error)
        return new NextResponse("Failed to update user", { status: 500 })
    }
}

