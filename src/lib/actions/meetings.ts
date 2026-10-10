"use server";

import { toggleMeetingRelease as toggleRelease } from "@/lib/db/meetings";
import type { CouncilMeetingWithAdminBody } from "@/lib/db/meetings";
import { LifecycleRuleError, type LifecycleRuleCode } from "@/lib/meetingLifecycleRules";

export type ToggleReleaseResult =
    | { ok: true; meeting: CouncilMeetingWithAdminBody }
    | { ok: false; code: LifecycleRuleCode; message: string };

/**
 * Browser-facing release toggle for the meeting admin panel.
 *
 * The data module is server-only. toggleMeetingRelease gates on
 * withUserAuthorizedToEdit before it writes. A refusal by a lifecycle rule
 * comes back as a value: production Next hides the message of an error that
 * a Server Action throws.
 */
export async function toggleMeetingRelease(
    cityId: string,
    id: string,
    released: boolean,
): Promise<ToggleReleaseResult> {
    try {
        return { ok: true, meeting: await toggleRelease(cityId, id, released) };
    } catch (error) {
        if (error instanceof LifecycleRuleError) return { ok: false, code: error.code, message: error.message };
        throw error;
    }
}
