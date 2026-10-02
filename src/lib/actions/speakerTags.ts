"use server";

import { assignSpeaker as assign } from "@/lib/db/speakerTags";
import type { SpeakerAssignment, SpeakerAssignmentScope } from "@/lib/db/speakerTags";
import type { SpeakerTag } from "@prisma/client";

/** Browser-facing speaker change for the transcript editor. assignSpeaker gates on withUserAuthorizedToEdit before it writes. */
export async function assignSpeaker(
    speakerSegmentId: string,
    assignment: SpeakerAssignment,
    scope: SpeakerAssignmentScope,
): Promise<SpeakerTag> {
    return assign(speakerSegmentId, assignment, scope);
}
