import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";
import { handleApiError } from "@/lib/api/errors";
import { queryFlag } from "@/lib/zod-schemas/primitives";
import { pollLivestreamsForRecentMeetings } from "@/lib/tasks/pollLivestreams";
import { transcribeUnattendedMeetings } from "@/lib/tasks/unattendedTranscription";

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

        // The same tick starts the recordings that a body with no operator saved
        // before its meeting (#829); the matcher above needs a channel, this does not.
        const [result, unattended] = await Promise.all([
            pollLivestreamsForRecentMeetings({ dryRun }),
            transcribeUnattendedMeetings({ dryRun }),
        ]);

        return NextResponse.json({ ...result, unattended });
    } catch (error) {
        return handleApiError(error, "Failed to poll livestreams");
    }
}
