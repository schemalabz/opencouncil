import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { handleApiError } from "@/lib/api/errors";
import { queryFlag } from "@/lib/zod-schemas/primitives";
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

    try {
        // ?dryRun=true logs decisions without triggering transcription or posting alerts.
        // A value that is not a boolean is a 400, so a typo never runs the real poll.
        const dryRun = queryFlag.default(false).parse(request.nextUrl.searchParams.get("dryRun") ?? undefined);

        const result = await pollLivestreamsForRecentMeetings({ dryRun });

        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, "Failed to poll livestreams");
    }
}
