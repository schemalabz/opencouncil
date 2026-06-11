"use server";

import type { VoiceprintCandidateSegment } from "@/lib/db/types";
import { getSpeakerSegmentForVoiceprint, getVoiceprintCandidatesForPerson } from "@/lib/db/voiceprintCandidates";
import { requestGenerateVoiceprint as requestAutomaticVoiceprint } from "@/lib/tasks/generateVoiceprint";
import { dispatchVoiceprintTaskForSegment } from "@/lib/tasks/voiceprintRequests";

export async function requestGenerateVoiceprint(personId: string) {
    return requestAutomaticVoiceprint(personId);
}

export async function requestGenerateVoiceprintForSegment(personId: string, segmentId: string) {
    const segment = await getSpeakerSegmentForVoiceprint(personId, segmentId);
    return dispatchVoiceprintTaskForSegment(personId, segment);
}

export async function getCandidateSegmentsForVoiceprint(personId: string): Promise<VoiceprintCandidateSegment[]> {
    return getVoiceprintCandidatesForPerson(personId);
}
