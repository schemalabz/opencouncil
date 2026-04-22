import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { revokeServiceApiKey } from "@/lib/db/apiKeys";
import { handleApiError } from "@/lib/api/errors";

export async function DELETE(
    _request: Request,
    { params }: { params: { id: string } }
) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        await revokeServiceApiKey(params.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, "Failed to revoke API key");
    }
}
