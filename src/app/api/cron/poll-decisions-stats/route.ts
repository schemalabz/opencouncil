import { NextRequest, NextResponse } from "next/server";
import { cronAuthFailure } from "@/lib/api/cron";
import { getPollingStats } from "@/lib/tasks/pollingStats";

export async function GET(request: NextRequest) {
    const refused = cronAuthFailure(request);
    if (refused) return refused;

    const stats = await getPollingStats();

    return NextResponse.json(stats);
}
