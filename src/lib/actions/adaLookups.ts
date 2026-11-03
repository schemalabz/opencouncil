"use server";

import { withRight } from "@/lib/auth";
import { getAdaLookupOutcome } from "@/lib/db/adaLookups";
import type { AdaLookupOutcome } from "@/lib/db/types";

/**
 * Browser-facing read of what a pollDecisions task found for a typed ΑΔΑ.
 */
export async function readAdaLookup(cityId: string, meetingId: string, taskId: string, ada: string): Promise<AdaLookupOutcome> {
    await withRight('records.read', { cityId, councilMeetingId: meetingId });
    return getAdaLookupOutcome(cityId, meetingId, taskId, ada);
}
