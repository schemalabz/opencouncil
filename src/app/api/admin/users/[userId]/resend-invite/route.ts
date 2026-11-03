import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"
import { sendInviteEmail } from "@/lib/auth/invite"
import { inviteRealm } from "@/lib/auth/grantScope"
import { renewPendingGrants } from "@/lib/auth/grants.server"
import { peopleOnly, userWithAdministersInclude } from "@/lib/db/types"

export async function POST(_request: Request, props: { params: Promise<{ userId: string }> }) {
    const params = await props.params;
    const currentUser = await getCurrentUser()
    if (!currentUser?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        // People only: an invite link is a sign-in link, and nothing signs a
        // machine account in.
        const user = await prisma.user.findFirst({
            where: { id: params.userId, ...peopleOnly },
            include: userWithAdministersInclude,
        })

        if (!user) {
            return new NextResponse("User not found", { status: 404 })
        }

        // A resend opens the pending grants again, for another
        // PENDING_GRANT_DAYS: the email says so, and an expired invite would
        // otherwise give the person nothing at the sign-in.
        const renewed = await renewPendingGrants(prisma, user.id, currentUser.id)
        const sent = await sendInviteEmail({
            email: user.email,
            name: user.name,
            realm: inviteRealm(user.administers),
            invitedBy: currentUser.name || currentUser.email,
            pending: renewed > 0,
        })

        if (!sent) {
            return new NextResponse("Failed to send invite email", { status: 500 })
        }

        return new NextResponse("Invite sent successfully", { status: 200 })
    } catch (error) {
        console.error("Failed to resend invite:", error)
        return new NextResponse("Failed to resend invite", { status: 500 })
    }
}
