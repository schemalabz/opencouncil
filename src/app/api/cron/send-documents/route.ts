import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { sendDueDocuments } from "@/lib/documents/automatic";

/**
 * The daily send of the documents a body's back office receives (#874):
 * the minutes, complete when every decision is in, provisional once the
 * threshold passes. See docs/task-architecture.md.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");

    if (!env.CRON_SECRET) {
        return NextResponse.json(
            { error: "CRON_SECRET not configured" },
            { status: 503 }
        );
    }

    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const result = await sendDueDocuments();

    return NextResponse.json(result);
}
