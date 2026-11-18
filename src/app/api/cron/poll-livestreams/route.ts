import { NextRequest, NextResponse } from "next/server";
import { cronAuthFailure } from "@/lib/api/cron";
import { handleApiError } from "@/lib/api/errors";
import { queryFlag } from "@/lib/zod-schemas/primitives";
import { pollLivestreamsForRecentMeetings } from "@/lib/tasks/pollLivestreams";
import { transcribeUnattendedMeetings } from "@/lib/tasks/unattendedTranscription";

export async function GET(request: NextRequest) {
    const refused = cronAuthFailure(request);
    if (refused) return refused;

    try {
        // ?dryRun=true logs decisions without triggering transcription or posting alerts.
        // A value that is not a boolean is a 400, so a typo never runs the real poll.
        const dryRun = queryFlag.default(false).parse(request.nextUrl.searchParams.get("dryRun") ?? undefined);

        // The same tick starts the recordings that a body with no operator saved
        // before its meeting (#829); the matcher above needs a channel, this does
        // not. The two never take the same meeting: a saved recording keeps the
        // matcher away from it. Each pass settles on its own, so a failure of
        // one hides neither the result nor the work of the other.
        const [livestreams, unattended] = await Promise.allSettled([
            pollLivestreamsForRecentMeetings({ dryRun }),
            transcribeUnattendedMeetings({ dryRun }),
        ]);

        const failed = livestreams.status === 'rejected' || unattended.status === 'rejected';
        return NextResponse.json({ ...passOutcome('livestreams', livestreams), unattended: passOutcome('unattended', unattended) }, { status: failed ? 500 : 200 });
    } catch (error) {
        return handleApiError(error, "Failed to poll livestreams");
    }
}

/** The result of a pass, or the error that it failed with. */
function passOutcome<T>(name: string, outcome: PromiseSettledResult<T>): T | { error: string } {
    if (outcome.status === 'fulfilled') return outcome.value;
    console.error(`poll-livestreams: the ${name} pass failed:`, outcome.reason);
    return { error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) };
}
