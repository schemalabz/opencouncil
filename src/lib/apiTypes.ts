/*
 * Generic task types
 */

export interface TaskUpdate<T> {
    status: "processing" | "success" | "error";
    stage: string;
    progressPercent: number;
    result?: T;
    error?: string;
    version: number | undefined;
}

export interface TaskRequest {
    callbackUrl: string;
}

/*
 * System endpoints
 */

export interface HealthResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    environment: string;
    version: string;
    name: string;
    services?: {
        [serviceName: string]: any;
    };
}

export type MediaType = "audio" | "video";

/*
 * Task: Transcribe
 */

export interface TranscribeRequest extends TaskRequest {
    youtubeUrl: string;
    customVocabulary?: string[];
    customPrompt?: string;
    voiceprints?: Voiceprint[];
}

export type TranscriptWithUtteranceDrifts = Transcript & {
    transcription: {
        utterances: (Utterance & { drift: number })[];
    };
};

// Processed speaker information in the final transcript
export interface SpeakerIdentificationResult extends DiarizationSpeakerMatch {
    speaker: number;  // Numeric speaker ID used in utterances
}

export type TranscriptWithSpeakerIdentification = TranscriptWithUtteranceDrifts & {
    transcription: {
        speakers: SpeakerIdentificationResult[];
    };
}

export interface TranscribeResult {
    videoUrl: string;
    audioUrl: string;
    muxPlaybackId: string;
    transcript: TranscriptWithSpeakerIdentification;
}

/*
 * Task: Diarize
 */

export interface DiarizeRequest extends TaskRequest {
    audioUrl: string;
    voiceprints?: Voiceprint[];
}

interface DiarizationSpeakerMatch {
    match: string | null;  // The identified personId if there's a match
    confidence: { [personId: string]: number; };
}

export interface DiarizationSpeaker extends DiarizationSpeakerMatch {
    speaker: string;  // The speaker ID from diarization (may include SEG prefix)
}

export type Diarization = {
    start: number;
    end: number;
    speaker: string;
}[];

export type DiarizeResult = {
    diarization: Diarization;
    speakers: DiarizationSpeaker[];
};

export type Voiceprint = {
    personId: string;
    voiceprint: string;
}

/*
 * Task: Process Agenda
 */

export interface ProcessAgendaRequest extends TaskRequest {
    agendaUrl: string;
    people: {
        id: string;
        name: string;
        role: string;
        party: string;
    }[];
    topicLabels: string[];
    cityName: string;
    date: string;
}

export interface SubjectContext {
    text: string;
    citationUrls: string[];
}

export interface SpeakerSegment {
    speakerSegmentId: string;
    summary: string | null;
}

export interface SpeakerContribution {
    speakerId: string | null;
    text: string;  // Markdown with special reference links: [text](REF:UTTERANCE:id), [text](REF:PERSON:id), [text](REF:PARTY:id)
}

export enum DiscussionStatus {
    ATTENDANCE = "ATTENDANCE",
    SUBJECT_DISCUSSION = "SUBJECT_DISCUSSION",
    VOTE = "VOTE",
    OTHER = "OTHER"
}

export interface DiscussionRange {
    startUtteranceId: string | null;  // null = starts before batch
    endUtteranceId: string | null;    // null = continues after batch
    status: DiscussionStatus;
    subjectId: string | null;         // required for SUBJECT_DISCUSSION/VOTE
}

export interface Location {
    type: "point" | "lineString" | "polygon";
    text: string; // e.g. an area, an address, a road name
    coordinates: number[][]; // a sequence of coordinates. just one coordinate for a point, more for a line or polygon
}

export interface Subject {
    id?: string;  // Optional ID assigned by backend (used for mapping utteranceDiscussionStatuses)
    name: string;
    description: string;  // Markdown with special reference links: [text](REF:UTTERANCE:id), [text](REF:PERSON:id), [text](REF:PARTY:id)
    agendaItemIndex: number | "BEFORE_AGENDA" | "OUT_OF_AGENDA";
    introducedByPersonId: string | null;

    speakerContributions: SpeakerContribution[];

    topicImportance: 'doNotNotify' | 'normal' | 'high';
    proximityImportance: 'none' | 'near' | 'wide';

    location: Location | null;

    topicLabel: string | null;
    context: SubjectContext | null;
}

export interface ProcessAgendaResult {
    subjects: Subject[];
}

/*
 * Transcript
 * see https://docs.gladia.io/api-reference/v2/transcription/get#response-result
 */

export interface Transcript {
    metadata: {
        audio_duration: number;
        number_of_distinct_channels: number;
        billing_time: number;
        transcription_time: number;
    };
    transcription: {
        languages: string[];
        full_transcript: string;
        utterances: Utterance[];
    };
}

export interface Utterance {
    text: string;
    language: string;
    start: number;
    end: number;
    confidence: number;
    channel: number;
    speaker: number;
    drift: number;
    words: Word[];
}

export interface Word {
    word: string;
    start: number;
    end: number;
    confidence: number;
}

/*
 * (Base) Request on Transcript
 */

// A generic type for requests that need a transcript as input
export interface RequestOnTranscript extends TaskRequest {
    transcript: {
        speakerName: string | null;
        speakerParty: string | null;
        speakerRole: string | null;
        speakerId: string | null;  // personId from voiceprint matching
        speakerSegmentId: string;
        text: string;
        utterances: {
            text: string;
            utteranceId: string;
            startTimestamp: number;
            endTimestamp: number;
        }[];
    }[];
    topicLabels: string[];
    cityName: string;
    administrativeBodyName: string | null;
    partiesWithPeople: {
        name: string;
        people: {
            name: string;
            role: string;
        }[];
    }[];
    date: string;
}

/*
 * Fix Transcript
 */

export interface FixTranscriptRequest extends RequestOnTranscript { }

export interface FixTranscriptResult {
    updateUtterances: {
        utteranceId: string;
        markUncertain: boolean;
        text: string;
    }[];
}

/*
 * Summarize
 */

export interface SummarizeRequest extends RequestOnTranscript {
    requestedSubjects: string[];
    existingSubjects: Subject[];
    additionalInstructions?: string;
}

export interface SummarizeResult {
    speakerSegmentSummaries: {
        speakerSegmentId: string;
        topicLabels: string[];
        summary: string | null;
        type: "PROCEDURAL" | "SUBSTANTIAL";
    }[];

    subjects: Subject[];

    utteranceDiscussionStatuses: {
        utteranceId: string;
        status: DiscussionStatus;
        subjectId: string | null;  // only for SUBJECT_DISCUSSION and VOTE
    }[];
}

/*
 * Produce Podcast
 */

export interface GeneratePodcastSpecRequest extends RequestOnTranscript {
    subjects: {
        name: string;
        description: string;
        speakerSegmentIds: string[];
        highlightedUtteranceIds: string[];
        allocation: "onlyMention" | "skip" | "full";
        allocatedMinutes: number;
    }[];

    audioUrl: string;
    additionalInstructions?: string;
}

export type PodcastPart =
    | {
        type: "host";
        text: string;
    }
    | {
        type: "audio";
        utteranceIds: string[];
    };

export interface GeneratePodcastSpecResult {
    parts: PodcastPart[];
}

/*
 * Split Media File
 */

export interface SplitMediaFileRequest extends TaskRequest {
    url: string; // an mp4 or mp3 url
    type: MediaType;
    parts: {
        // a part of the file, consisting of multiple contiguous segments
        id: string;
        segments: {
            // a contiguous segments of the media file
            startTimestamp: number;
            endTimestamp: number;
        }[];
    }[];
}

export interface SplitMediaFileResult {
    parts: {
        id: string;
        url: string;
        type: MediaType;
        duration: number;
        startTimestamp: number;
        endTimestamp: number;
        muxPlaybackId?: string;
    }[];
}

/*
 * Generate Highlight
 */
export interface GenerateHighlightRequest extends TaskRequest {
    media: {
        type: 'video';
        videoUrl: string;
    };
    parts: Array<{
        id: string; // highlightId
        utterances: Array<{
            utteranceId: string;
            startTimestamp: number;
            endTimestamp: number;
            text: string;
            speaker?: {
                id?: string;
                name?: string;
                partyColorHex?: string;
                partyLabel?: string;
                roleLabel?: string;
            };
        }>;
    }>;
    render: {
        includeCaptions?: boolean;
        includeSpeakerOverlay?: boolean;
        aspectRatio?: AspectRatio;

        // Social media formatting options (only used when aspectRatio is 'social-9x16')
        socialOptions?: {
            marginType?: 'blur' | 'solid';
            backgroundColor?: string;
            zoomFactor?: number;
        };
    };
}
// Shared rendering types
export type AspectRatio = 'default' | 'social-9x16';

export interface GenerateHighlightResult {
    parts: Array<{
        id: string; // highlightId
        url: string;
        muxPlaybackId?: string;
        duration: number;
        startTimestamp: number;
        endTimestamp: number;
    }>;
}

/**
 * Generate Voiceprint Task Types
 */

export interface GenerateVoiceprintRequest extends TaskRequest {
    mediaUrl: string; // URL to audio or video source
    segmentId: string; // Speaker segment ID used for the voiceprint
    startTimestamp: number; // Start timestamp in the media file
    endTimestamp: number; // End timestamp in the media file
    // Used only for file naming in S3
    cityId: string;
    personId: string;
}

export interface GenerateVoiceprintResult {
    audioUrl: string; // URL to the extracted audio
    voiceprint: string; // Voiceprint embedding vector in base64
    duration: number; // Duration of the audio
}
