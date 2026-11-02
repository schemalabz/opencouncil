export interface VoiceprintCandidateSegment {
    segmentId: string;
    meetingId: string;
    cityId: string;
    meetingName: string;
    meetingNameEn: string;
    meetingDate: string; // ISO string
    meetingTimezone: string;
    startTimestamp: number;
    endTimestamp: number;
    duration: number; // seconds
    mediaUrl: string | null; // meeting audio/video URL for audio preview, if available
    previewStartTimestamp: number; // start of the 30s window the voiceprint will use (seconds)
    previewEndTimestamp: number; // end of the 30s window the voiceprint will use (seconds)
    windowText: string; // transcript of the centered 30s window — what the admin actually hears
    fullText: string; // full transcript of the segment — shown on demand for fuller context
}

