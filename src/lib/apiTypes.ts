
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


export interface TranscribeResult {
    videoUrl: string;
    audioUrl: string;
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
