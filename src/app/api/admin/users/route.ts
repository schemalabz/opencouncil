import { getCurrentUser } from "@/lib/auth"
import { NextResponse } from "next/server"
import { createUser, getUsers, updateUser } from "@/lib/db/users"
import { sendUserOnboardedAdminAlert } from "@/lib/discord"
import { handleApiError } from "@/lib/api/errors"
import { sendInviteEmail } from "@/lib/auth/invite"
import { createAdminUserSchema, updateAdminUserSchema } from "@/lib/zod-schemas/user"

export async function GET() {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const users = await getUsers()
        return NextResponse.json(users)
    } catch (error) {
        return handleApiError(error, "Failed to fetch users")
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const raw = await request.json()
    const parsed = createAdminUserSchema.safeParse(raw)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { email, name, isSuperAdmin, administers } = parsed.data

    try {
        const newUser = await createUser({ email, name, isSuperAdmin, administers })

        // Send invitation email
        const inviteEmailSent = await sendInviteEmail(newUser.email, newUser.name ?? newUser.email)

        if (!inviteEmailSent) {
            console.error(`User ${newUser.id} created, but invite email failed to send`)
            return NextResponse.json({ ...newUser, warning: "User created but invite email could not be sent." })
        }

        // Only alert when the full invite flow succeeded
        sendUserOnboardedAdminAlert({
            cityName: isSuperAdmin ? 'Super Admin' : 'Admin User',
            onboardingSource: 'admin_invite',
        });

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

    const raw = await request.json()
    const parsed = updateAdminUserSchema.safeParse(raw)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { id, email, name, isSuperAdmin, administers } = parsed.data

    try {
        const updatedUser = await updateUser(id, { email, name, isSuperAdmin, administers })
        return NextResponse.json(updatedUser)
    } catch (error) {
        return handleApiError(error, "Failed to update user")
    }
}
