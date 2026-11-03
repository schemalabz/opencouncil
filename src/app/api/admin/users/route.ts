import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth"
import { NextResponse } from "next/server"
import { createUser, getUsers, updateUser } from "@/lib/db/users"
import { createMachineAccount } from "@/lib/db/machineAccounts"
import { sendUserOnboardedAdminAlert } from "@/lib/discord"
import { handleApiError } from "@/lib/api/errors"
import { sendInviteEmail } from "@/lib/auth/invite"
import { realmOfGrant } from "@/lib/auth/grantScope"
import { createUserRequestSchema, updateAdminUserSchema } from "@/lib/zod-schemas/user"

export async function GET() {
    try {
        await withUserAuthorizedToEdit({})
        const users = await getUsers()
        return NextResponse.json(users)
    } catch (error) {
        return handleApiError(error, "Failed to fetch users")
    }
}

export async function POST(request: Request) {
    try {
        await withUserAuthorizedToEdit({})
        const body = createUserRequestSchema.parse(await request.json().catch(() => null))

        // A machine account gets no invite: nothing can sign it in, and no
        // mail reaches its address.
        if (body.isMachine === true) {
            return NextResponse.json(await createMachineAccount(body))
        }

        const { email, name, isSuperAdmin, administers } = body

        const newUser = await createUser({ email, name, isSuperAdmin, administers })

        // The grants wait, pending, for the first sign-in; the email lands on
        // the realm of the first one, so the session lands where the work is.
        const actor = await getCurrentUser()
        const inviteEmailSent = await sendInviteEmail({
            email: newUser.email,
            name: newUser.name,
            realm: newUser.administers[0] ? realmOfGrant(newUser.administers[0]) : null,
            invitedBy: actor?.name || actor?.email || null,
            pending: true,
        })

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
    try {
        await withUserAuthorizedToEdit({})
        const { id, email, name, isSuperAdmin, administers } = updateAdminUserSchema.parse(await request.json().catch(() => null))

        const updatedUser = await updateUser(id, { email, name, isSuperAdmin, administers })
        return NextResponse.json(updatedUser)
    } catch (error) {
        return handleApiError(error, "Failed to update user")
    }
}
