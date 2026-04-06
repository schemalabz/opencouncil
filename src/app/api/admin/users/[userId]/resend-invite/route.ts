import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"
import { sendInviteEmail } from "@/lib/auth/invite"

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

        const sent = await sendInviteEmail(user.email, user.name)

        if (!sent) {
            return new NextResponse("Failed to send invite email", { status: 500 })
        }

        return new NextResponse("Invite sent successfully", { status: 200 })
    } catch (error) {
        console.error("Failed to resend invite:", error)
        return new NextResponse("Failed to resend invite", { status: 500 })
    }
}
