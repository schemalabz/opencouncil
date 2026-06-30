import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { pollLivestreamsForRecentMeetings } from "@/lib/tasks/pollLivestreams";

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

    // ?dryRun=1 logs decisions without triggering transcription or posting alerts.
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

    const result = await pollLivestreamsForRecentMeetings({ dryRun });

    return NextResponse.json(result);
}
