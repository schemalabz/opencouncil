"use server";

import { withUserAuthorizedToEdit } from "@/lib/auth";
import {
    setMeetingReviewer as storeMeetingReviewer,
    type ReviewerUser,
} from "@/lib/db/meetingReviewers";

/**
 * Browser-facing assignment of a meeting's transcript review.
 * Only a superadmin can call it, and only a superadmin can be the target.
 */
export async function setMeetingReviewer(
    cityId: string,
    meetingId: string,
    userId: string | null
): Promise<ReviewerUser | null> {
    await withUserAuthorizedToEdit({});
    return storeMeetingReviewer({ cityId, meetingId }, userId);
}
