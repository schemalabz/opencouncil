// Pure helpers for voiceprint segment windows. Kept out of the "use server"
// module (generateVoiceprint.ts) so non-async exports are allowed and the logic
// can be unit-tested and reused on the client.

/** Target length, in seconds, of the audio window used to build a voiceprint. */
export const VOICEPRINT_DURATION = 30;

/**
 * Compute the time window actually used to build a voiceprint from a segment.
 *
 * The window is `windowDuration` seconds centered on the segment midpoint,
 * clamped to the segment bounds. This is the single source of truth shared by
 * task dispatch (what the voiceprint job consumes) and the admin candidate
 * picker (what the admin previews), so "what you hear" equals "what is used".
 *
 * Timestamps are in seconds, matching SpeakerSegment timestamps and HTML media
 * fragment (`#t=`) semantics.
 */
export function computeVoiceprintWindow(
    startTimestamp: number,
    endTimestamp: number,
    windowDuration: number = VOICEPRINT_DURATION,
): { startTimestamp: number; endTimestamp: number } {
    if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
        throw new Error("computeVoiceprintWindow: timestamps must be finite numbers");
    }
    if (startTimestamp > endTimestamp) {
        throw new Error("computeVoiceprintWindow: startTimestamp must not exceed endTimestamp");
    }
    if (!(windowDuration > 0)) {
        throw new Error("computeVoiceprintWindow: windowDuration must be positive");
    }

    const segmentDuration = endTimestamp - startTimestamp;
    const segmentMidpoint = startTimestamp + segmentDuration / 2;
    const halfDuration = windowDuration / 2;
    const windowStart = Math.max(startTimestamp, segmentMidpoint - halfDuration);
    const windowEnd = Math.min(endTimestamp, windowStart + windowDuration);
    return { startTimestamp: windowStart, endTimestamp: windowEnd };
}
