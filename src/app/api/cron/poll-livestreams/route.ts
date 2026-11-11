import { NextRequest, NextResponse } from "next/server";
import { cronAuthFailure } from "@/lib/api/cron";
import { handleApiError } from "@/lib/api/errors";
import { queryFlag } from "@/lib/zod-schemas/primitives";
import { pollLivestreamsForRecentMeetings } from "@/lib/tasks/pollLivestreams";

export async function GET(request: NextRequest) {
    const refused = cronAuthFailure(request);
    if (refused) return refused;

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
