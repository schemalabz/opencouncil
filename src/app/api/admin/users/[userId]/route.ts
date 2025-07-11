import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/db/prisma"
import { NextResponse } from "next/server"

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

        await prisma.user.delete({
            where: { id: userId },
        })

        return NextResponse.json({ message: "User deleted successfully" })
    } catch (error) {
        console.error("Failed to delete user:", error)
        // Check for specific Prisma error for record not found
        if (error instanceof Error && (error as any).code === 'P2025') {
            return new NextResponse("User not found", { status: 404 })
        }
        return new NextResponse("Failed to delete user", { status: 500 })
    }
} 