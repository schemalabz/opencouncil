import "server-only";

import type { SpeakerSegment } from "@prisma/client";
import type { GenerateVoiceprintRequest } from "@/lib/apiTypes";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { getCouncilMeeting } from "@/lib/db/meetings";
import { startTask } from "@/lib/tasks/tasks";
import { VOICEPRINT_DURATION, computeVoiceprintWindow } from "@/lib/tasks/voiceprintWindow";

/**
 * Build and dispatch a generateVoiceprint task for an explicit speaker segment.
 *
 * Shared by both the automatic (longest-segment) flow and the manual
 * segment-selection flow. Validates the segment is long enough, resolves the
 * meeting media URL, authorizes the caller for the segment's city, and computes
 * a VOICEPRINT_DURATION window centered on the segment midpoint.
 */
export async function dispatchVoiceprintTaskForSegment(personId: string, segment: SpeakerSegment) {
    await withUserAuthorizedToEdit({ personId });
    await withUserAuthorizedToEdit({ cityId: segment.cityId });

    // Check if the segment is long enough for a voiceprint
    const segmentDuration = segment.endTimestamp - segment.startTimestamp;
    if (segmentDuration < VOICEPRINT_DURATION) {
        throw new Error(
            `Speaker segment is too short (${segmentDuration.toFixed(1)}s). At least ${VOICEPRINT_DURATION}s of audio is required for a voiceprint.`,
        );
    }

    // Get meeting details
    const meeting = await getCouncilMeeting(segment.cityId, segment.meetingId);

    if (!meeting) {
        throw new Error("Meeting not found");
    }

    const mediaUrl = meeting.audioUrl || meeting.videoUrl;
    if (!mediaUrl) {
        throw new Error("Meeting media URL not found");
    }

    // Take a VOICEPRINT_DURATION window centered on the segment, clamped to its bounds
    const { startTimestamp, endTimestamp } = computeVoiceprintWindow(
        segment.startTimestamp,
        segment.endTimestamp,
    );

    // Create the request
    const request: Omit<GenerateVoiceprintRequest, "callbackUrl"> = {
        mediaUrl,
        personId,
        segmentId: segment.id,
        startTimestamp,
        endTimestamp,
        cityId: segment.cityId,
    };

    return startTask("generateVoiceprint", request, segment.meetingId, segment.cityId);
}

