import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api/errors";
import { getProductUpdateRecipientCount } from "@/lib/db/productUpdates";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { optedIn, total } = await getProductUpdateRecipientCount();
        return NextResponse.json({ optedIn, total });
    } catch (error) {
        return handleApiError(error, "Failed to fetch recipient count");
    }
}
