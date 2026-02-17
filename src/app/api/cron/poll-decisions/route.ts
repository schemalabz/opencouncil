import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { pollDecisionsForRecentMeetings } from "@/lib/tasks/pollDecisions";

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

    const result = await pollDecisionsForRecentMeetings();

    return NextResponse.json(result);
}
