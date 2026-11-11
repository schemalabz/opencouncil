import { NextRequest, NextResponse } from "next/server";
import { cronAuthFailure } from "@/lib/api/cron";
import { handleApiError } from "@/lib/api/errors";
import { sendDueDocuments } from "@/lib/documents/automatic";

/**
 * The daily send of the documents a body's back office receives (#874):
 * the minutes, complete when every decision is in, provisional once the
 * threshold passes. See docs/task-architecture.md.
 */
export async function GET(request: NextRequest) {
    const refused = cronAuthFailure(request);
    if (refused) return refused;

    try {
        return NextResponse.json(await sendDueDocuments());
    } catch (error) {
        return handleApiError(error, "Failed to send the due documents");
    }
}
