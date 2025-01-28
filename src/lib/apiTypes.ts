
/*
 * Generic task types 
 */

export interface TaskUpdate<T> {
    status: "processing" | "success" | "error";
    stage: string;
    progressPercent: number;
    result?: T;
    error?: string;
}

export interface TaskRequest {
    callbackUrl: string;
}

/*
 * Task: Transcribe
 */

export interface TranscribeRequest extends TaskRequest {
    youtubeUrl: string;
    customVocabulary?: string[];
    customPrompt?: string;
}


export type TranscriptWithUtteranceDrifts = Transcript & {
    transcription: {
        utterances: (Utterance & { drift: number })[];
    };
};

export interface TranscribeResult {
    videoUrl: string;
    audioUrl: string;
    muxPlaybackId: string;
    transcript: Transcript;
}

/*
 * Task: Diarize
 */

export interface DiarizeRequest extends TaskRequest {
    audioUrl: string;
}

export interface DiarizeResult {
    diarization: Diarization;
}

export type Diarization = {
    start: number;
    end: number;
    speaker: string;
}[];

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

export interface Subject {
    name: string;
    description: string;
    hot: boolean;
    agendaItemIndex: number | null;
    introducedByPersonId: string | null;
    speakerSegments: {
        speakerSegmentId: string;
        summary: string | null;
    }[];
    highlightedUtteranceIds: string[];
    location: {
        type: 'point' | 'lineString' | 'polygon';
        text: string; // e.g. an area, an address, a road name
        coordinates: number[][]; // a sequence of coordinates. just one coordinate for a point, more for a line or polygon
    } | null;
    topicLabel: string | null;
};

export interface ProcessAgendaResult {
    subjects: Subject[];
}

/*
 * Transcript
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

export interface FixTranscriptRequest extends RequestOnTranscript {
}

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
    }[];

    subjects: Subject[];
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
        allocation: 'onlyMention' | 'skip' | 'full';
        allocatedMinutes: number;
    }[];

    audioUrl: string;
    additionalInstructions?: string;
}

export type PodcastPart = {
    type: "host";
    text: string;
} | {
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
    type: 'audio' | 'video';
    parts: { // a part of the file, consisting of multiple contiguous segments
        id: string;
        segments: { // a contiguous segments of the media file
            startTimestamp: number;
            endTimestamp: number;
        }[];
    }[];
}

export interface SplitMediaFileResult {
    parts: {
        id: string;
        url: string;
        type: 'audio' | 'video';
        duration: number;
        startTimestamp: number;
        endTimestamp: number;
    }[];
}
