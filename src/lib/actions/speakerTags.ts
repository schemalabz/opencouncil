"use server";

import { assignSpeaker as assign, getSpeakerIdentificationsForMeeting as getIdentifications } from "@/lib/db/speakerTags";
import type { SpeakerAssignment, SpeakerAssignmentScope, SpeakerTagIdentification } from "@/lib/db/speakerTags";
import type { SpeakerTag } from "@prisma/client";

/** Browser-facing speaker change for the transcript editor. assignSpeaker gates on withUserAuthorizedToEdit before it writes. */
export async function assignSpeaker(
    speakerSegmentId: string,
    assignment: SpeakerAssignment,
    scope: SpeakerAssignmentScope,
): Promise<SpeakerTag> {
    return assign(speakerSegmentId, assignment, scope);
}

/** Browser-facing read of a meeting's speaker identifications, for the reviewer's editor. getSpeakerIdentificationsForMeeting gates on withUserAuthorizedToEdit before it reads. */
export async function getSpeakerIdentificationsForMeeting(cityId: string, meetingId: string): Promise<SpeakerTagIdentification[]> {
    return getIdentifications(cityId, meetingId);
}
