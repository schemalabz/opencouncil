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

// Content language of the city a task runs for. Kept as a self-contained string
// union (this file is the backend contract and has no Prisma imports); mirrors
// the Prisma `CityLanguage` enum.
export type CityLanguage = 'el' | 'fr' | 'sr';

// ISO 3166-1 alpha-2 code (uppercase) of the country a task's city is in. The
// backend restricts geocoding of subject locations to it; without it everything
// is geocoded as if it were in Greece. Comes from the city's realm, not its
// language — see `getRealmCountry`.
export type Country = 'GR' | 'FR' | 'CY' | 'RS';

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

/*
 * Task: Transcribe
 */

export interface TranscribeRequest extends TaskRequest {
    youtubeUrl: string;
    voiceprints?: Voiceprint[];
    cityLanguage: CityLanguage;
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

export interface TopicLabelInfo {
    name: string;
    description: string;
}

export interface ProcessAgendaRequest extends TaskRequest {
    agendaUrl: string;
    people: {
        id: string;
        name: string;
        role: string;
        party: string;
    }[];
    topicLabels: TopicLabelInfo[];
    cityName: string;
    cityLanguage: CityLanguage;
    country: Country;
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
    speakerName: string | null;  // Display name for speakers without a person record
    text: string;  // Markdown with special reference links: [text](REF:UTTERANCE:id), [text](REF:PERSON:id), [text](REF:PARTY:id)
    order?: number | null;  // Display order within the subject (0-based)
}

export enum DiscussionStatus {
    ATTENDANCE = "ATTENDANCE",
    SUBJECT_DISCUSSION = "SUBJECT_DISCUSSION",
    PROCEDURAL_VOTE = "PROCEDURAL_VOTE",
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
    /**
     * The item as written on the official agenda (#616). processAgenda sets it for
     * every subject. summarize never sets it. When the field is absent, the stored value stays as it is.
     */
    agendaItemTitle?: string | null;
    agendaItemIndex: number | "BEFORE_AGENDA" | "OUT_OF_AGENDA";
    introducedByPersonId: string | null;

    speakerContributions: SpeakerContribution[];

    topicImportance: 'doNotNotify' | 'normal' | 'high';
    proximityImportance: 'none' | 'near' | 'wide';

    location: Location | null;

    topicLabel: string | null;
    context: SubjectContext | null;

    // Set to true when subject won't be discussed: withdrawal/postponement or rejected κατεπείγον
    withdrawn?: boolean;

    // Reference to primary subject ID (API identifier, not DB ID)
    discussedIn?: string;
}

export interface ProcessAgendaResult {
    subjects: Subject[];
}

/*
 * Transcript
 * Shape produced by the opencouncil-tasks transcribe task (see Transcript in
 * opencouncil-tasks src/types.ts). Historically derived from Gladia's v2
 * response format; audio is now transcribed with ElevenLabs Scribe and
 * converted to this shape.
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
    confidence: number; // arithmetic mean of word confidences
    // Optional because processTaskResponse can replay results stored by
    // transcribe task versions before 4, which lack these two scores.
    minWordConfidence?: number; // confidence of the least confident word
    totalConfidence?: number; // product of word confidences ≈ P(every word is right)
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
    topicLabels: TopicLabelInfo[];
    cityName: string;
    cityLanguage: CityLanguage;
    country: Country;
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

/*
 * Extract Decisions (PDF → structured data)
 */

/** Per-decision warning from the extraction pipeline. See DecisionWarningCode in opencouncil-tasks for the full list of codes. */
export interface DecisionWarning {
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
}

export interface ExtractedDecisionData {
    subjectId: string;
    excerpt: string;
    references: string;
    presentMemberIds: string[];
    absentMemberIds: string[];
    mayorPresent?: boolean;
    voteResult: string | null;
    voteDetails: { personId: string; vote: 'FOR' | 'AGAINST' | 'ABSTAIN' | 'PRESENT' | 'DID_NOT_VOTE' }[];
    unmatchedMembers: string[];
    subjectInfo: { number: number; isOutOfAgenda: boolean } | null;
    fromCache?: boolean;
    warnings?: DecisionWarning[];
    /** The decision's own number (Αρ. Απόφασης / Πράξη), extracted from the document. */
    decisionNumber?: string | null;
    /**
     * @deprecated Older tasks versions sent the extracted decision number under this
     * name. It was never Diavgeia's protocol number. Read for transition tolerance only.
     */
    protocolNumber?: string | null;
    /** Metadata fetched from Diavgeia API for needsExtraction subjects */
    diavgeiaTitle?: string;
    diavgeiaPublishDate?: string;
    /** Diavgeia's own protocolNumber field, mirrored verbatim. Municipality-defined semantics. */
    diavgeiaProtocolNumber?: string;
}

/*
 * Task: Poll Decisions (Diavgeia) — includes extraction
 */

export interface PollDecisionsRequest extends TaskRequest {
    meetingDate: string; // ISO date "YYYY-MM-DD"
    diavgeiaUid: string; // City's Diavgeia org UID (e.g., "6104")
    diavgeiaUnitIds?: string[]; // AdministrativeBody's Diavgeia scopes, each `unit[:signer]` (e.g., ["81689"], ["84655:100010590"])
    mayorId?: string; // Person ID of the city mayor, for presence extraction
    forceExtract?: boolean; // Skip extraction cache and reprocess all PDFs
    people: { id: string; name: string }[];
    subjects: Array<{
        subjectId: string;
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: string | null;
        existingDecision?: {
            ada: string;
            decisionTitle: string;
            pdfUrl: string;
            needsExtraction?: boolean;
        };
    }>;
    /** The polled meeting's administrative-body name, for the (body, date) partition. */
    administrativeBodyName?: string | null;
    /** Fetch window, derived from the city's publication-lag history. Absent = tasks uses its legacy 45-day window. */
    window?: { fromDate: string; toDate: string };
    /**
     * Reading-cache handshake, scoped by the WINDOW, not the meeting: every
     * DecisionCandidate the city holds whose publishDate falls inside the poll
     * window. Presence + readStatus decide whether tasks reads again;
     * meetingDate decides which partition the decision belongs to.
     */
    knownDecisions?: Array<{ ada: string; meetingDate: string | null; readStatus: string }>;
}

/**
 * A decision read in the poll window (issue #617). subjectId null = unplaced;
 * rows declaring another meeting carry no matching fields.
 */
export interface PollDecisionsReadDecision {
    ada: string;
    title: string | null;
    pdfUrl: string;
    protocolNumber: string | null;   // Diavgeia's field, verbatim
    publishDate: string | null;
    meetingDate: string | null;
    decisionNumber: string | null;
    /** The deliberative body as the document states it. */
    body?: string | null;
    readStatus: string;
    /** True when the reading was echoed from knownDecisions, not freshly read. */
    fromKnown?: boolean;
    subjectId: string | null;
    confidence: number | null;
    reasoning: string | null;
}

export interface PollDecisionsMatch {
    subjectId: string;
    ada: string; // Diavgeia unique ID (e.g., "ΨΘ82ΩΡΦ-7ΑΙ")
    decisionTitle: string; // Full title from Diavgeia
    pdfUrl: string;
    protocolNumber: string; // e.g., "231/2025"
    publishDate: string; // ISO date when published on Diavgeia
    matchConfidence: number; // 0-1 confidence score
    reasoning?: string | null; // resolver's stated reasoning for this match
}

export interface PollDecisionsResult {
    /** Every decision read in the poll window. Absent from older tasks versions. */
    decisions?: PollDecisionsReadDecision[];
    matches: PollDecisionsMatch[];
    /** Always empty since #617 phase 3; read-and-ignored for older tasks versions. */
    reassignments: Array<{
        ada: string;
        fromSubjectId: string;
        toSubjectId: string;
        reason: string;
    }>;
    unmatchedSubjects: Array<{ subjectId: string; name: string; reason: string }>;
    ambiguousSubjects: Array<{
        subjectId: string;
        name: string;
        candidates: Array<{
            ada: string;
            pdfUrl: string;
            title: string;
            similarity: number;
        }>;
    }>;
    extractions: {
        decisions: ExtractedDecisionData[];
        warnings: string[];
        /** Initial roll call — who was present/absent at session start (meeting-level, not per-subject) */
        initialAttendance?: { personId: string; status: 'PRESENT' | 'ABSENT' }[];
        /** Names from the initial roll call that couldn't be matched to any person in the database */
        unmatchedInitialAttendance?: string[];
        /** Effective attendance for subjects WITHOUT linked decisions */
        nonDecisionSubjectAttendance?: Array<{
            subjectId: string;
            presentMemberIds: string[];
            absentMemberIds: string[];
        }>;
    } | null;
    costs: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number;
        cache_read_input_tokens: number;
    };
    metadata?: {
        diavgeiaUid: string;
        query: object;
        fetchedCount: number;
        matchedCount: number;
        unmatchedCount: number;
        ambiguousCount: number;
    };
}
