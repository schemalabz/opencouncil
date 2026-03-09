import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getHighlightsForUser } from "@/lib/db/highlights";
import { handleApiError } from "@/lib/api/errors";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const highlights = await getHighlightsForUser(user.id);
        return NextResponse.json(highlights);
    } catch (error) {
        return handleApiError(error, "Failed to fetch user highlights");
    }
}
