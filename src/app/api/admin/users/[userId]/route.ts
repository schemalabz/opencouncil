import { getCurrentUser } from "@/lib/auth"
import { deleteUser } from "@/lib/db/users"
import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api/errors"

export async function DELETE(
    request: Request,
    { params }: { params: { userId: string } }
) {
    try {
        const currentUser = await getCurrentUser()

        if (!currentUser) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        if (!currentUser.isSuperAdmin) {
            return new NextResponse("Forbidden", { status: 403 })
        }

        const { userId } = params

        if (userId === currentUser.id) {
            return new NextResponse("You cannot delete your own account.", { status: 400 })
        }

        await deleteUser(userId)

        return NextResponse.json({ message: "User deleted successfully" })
    } catch (error) {
        return handleApiError(error, "Failed to delete user")
    }
} 