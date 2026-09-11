"use server";

import { toggleMeetingRelease as toggleRelease } from "@/lib/db/meetings";
import type { CouncilMeetingWithAdminBody } from "@/lib/db/meetings";

/**
 * Browser-facing release toggle for the meeting admin panel.
 *
 * The data module is server-only, so this is the one meeting write a client
 * component can reach. It adds no authorization of its own: toggleMeetingRelease
 * gates on withUserAuthorizedToEdit before it touches the row.
 */
export async function toggleMeetingRelease(
    cityId: string,
    id: string,
    released: boolean,
): Promise<CouncilMeetingWithAdminBody> {
    return toggleRelease(cityId, id, released);
}
