import { getCurrentUser } from "@/lib/auth"
import { getAdminEntities } from "@/lib/db/adminEntities"
import { NextResponse } from "next/server"

export async function GET() {
    const user = await getCurrentUser()
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        return NextResponse.json(await getAdminEntities())
    } catch (error) {
        console.error("Failed to fetch entities:", error)
        return new NextResponse("Failed to fetch entities", { status: 500 })
    }
}
