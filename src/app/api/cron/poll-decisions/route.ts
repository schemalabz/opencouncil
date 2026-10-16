import { NextRequest, NextResponse } from "next/server";
import { cronAuthFailure } from "@/lib/api/cron";
import { pollDecisionsForRecentMeetings } from "@/lib/tasks/pollDecisions";

export async function GET(request: NextRequest) {
    const refused = cronAuthFailure(request);
    if (refused) return refused;

    const result = await pollDecisionsForRecentMeetings();

    return NextResponse.json(result);
}
