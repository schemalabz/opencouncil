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
    /**
     * The id of the subject row. For a subject that already exists, the app sends
     * the database id in `existingSubjects` and the task server hands it back, so
     * `categorizeSubjectsForUpsert` keeps that row (issue 366). A new subject
     * carries an id that the task server generates. `utteranceDiscussionStatuses`
     * and `discussedIn` reference these ids.
     */
    id?: string;
    name: string;
    description: string;  // Markdown with special reference links: [text](REF:UTTERANCE:id), [text](REF:PERSON:id), [text](REF:PARTY:id)
    /**
     * The item as written on the official agenda (#616). processAgenda sets it for
     * every subject. summarize never sets it. When the field is absent, the stored value stays as it is.
     */
    agendaItemTitle?: string | null;
    /**
     * The agenda section the item sits under (issue 366). processAgenda sets it for
     * every subject; null means the agenda has one numbered list. summarize never
     * sends it, and an absent field leaves the stored value alone.
     */
    agendaSection?: { index: number; title: string } | null;
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
        // The diarization speaker this segment belongs to. Every segment of one
        // voice shares it, whether or not that voice has been matched to a person.
        speakerTagId?: string;
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
    /**
     * The people who may speak at the meeting: the one list of people the
     * transcript tasks get. fixTranscript corrects names against it, and
     * identifies speakers from it when segments carry speakerTagId.
     */
    people: RosterPerson[];
    /**
     * @deprecated The same people grouped by party, without the ones who have
     * no party. A task server that predates `people` reads this. Remove it once
     * every task server reads `people`.
     */
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

/** One of a meeting's people: someone who may speak at it, and so someone a speaker can be identified as. */
export interface RosterPerson {
    id: string;
    name: string;
    /** Roles held on the meeting date, the ones in the meeting's body first. */
    role: string | null;
    /** The party's name on the meeting date. */
    party: string | null;
    /** Leads that party: "the head of the party" is a common way to give the floor. */
    partyHead?: boolean;
    /** Holds an active role in the administrative body that is meeting. */
    memberOfMeetingBody?: boolean;
}

/**
 * The kind of cue a transcript identification rests on, strongest first.
 * - named:          the speaker is given the floor by name, right before they speak
 * - rollCall:       a name is read out and the speaker answers
 * - selfIntroduced: the speaker states their own name or role
 * - addressed:      others address the speaker by name or role title
 * - roleBehaviour:  only what the speaker does (chairs, answers as the
 *                   executive); no name or title is spoken
 */
export type SpeakerEvidenceKind = "named" | "rollCall" | "selfIntroduced" | "addressed" | "roleBehaviour";

/**
 * Who a diarization speaker is, judged from the transcript text alone (the
 * chair giving the floor by name, roll calls, self-introductions). Independent
 * of voiceprint matching: the caller reconciles the two.
 */
export interface SpeakerHint {
    speakerTagId: string;
    personId: string;
    /**
     * Whether the task would act on this identification by itself. The task
     * decides, next to the prompt that produces the evidence, as it decides
     * whether a voiceprint matched: the caller compares identities and never
     * thresholds a number. A hint that is not actionable is a suggestion for a
     * reviewer and nothing more.
     */
    actionable: boolean;
    /** The strongest kind of evidence behind the identification; null when the model named none. */
    evidenceKind: SpeakerEvidenceKind | null;
    /** 0–100, the model's own number. For a reviewer to read, not a contract. */
    confidence: number;
    /** The decisive transcript line(s) with their timestamp, for a reviewer to check the name. */
    evidence: string;
}

export interface FixTranscriptRequest extends RequestOnTranscript {
    /** The meeting's items, for the meeting-facts pass to anchor its statements to. */
    agendaItems?: MeetingAgendaItem[];
}

export interface FixTranscriptResult {
    updateUtterances: {
        utteranceId: string;
        markUncertain: boolean;
        text: string;
    }[];
    /** One entry per speaker the transcript identifies. Absent when the task did not run the identification. */
    speakerHints?: SpeakerHint[];
    /** What the transcript states about the meeting. Absent when the request had no people or the pass failed. */
    meetingFacts?: MeetingFactsReading;
}

/*
 * Meeting facts: what the meeting states about itself
 *
 * Two sources beside the decision documents: the sheet the back office keeps
 * during the meeting, and the transcript. Each reader returns what its source
 * states, with the line or the utterance it read it from, and nothing that
 * follows from two statements. opencouncil combines the sources.
 */

/** A range of items a statement covers: agenda items 2 to 8, or the 1st out-of-agenda item. */
export interface ItemRange {
    kind: 'agenda_item' | 'out_of_agenda';
    from: number;
    to: number;
}

/** One person on a stated roll call, with where the reader read it. */
export interface StatedRollCallEntry {
    name: string;
    /** Resolved person, or null when the name matched nobody in the roster. */
    personId: string | null;
    status: 'PRESENT' | 'ABSENT';
    /** The sheet says whether the absence was justified; null when it does not say. */
    absenceJustified: boolean | null;
    rawText: string;
    /** Transcript: the utterance the entry was read from. */
    utteranceId: string | null;
    /** Sheet: the line on the page, counted from 1, as the reader numbered it. */
    line: number | null;
}

/** An arrival, a departure or a per-vote absence a source states, with where it was read. */
export interface MeetingFactsChange extends PollDecisionsAttendanceEvent {
    utteranceId: string | null;
    line: number | null;
}

export type StatedOutcome = 'unanimous' | 'majority' | 'rejected';

/** One vote as a source states it: the items it covers, the outcome, and whoever it names. */
export interface StatedVote {
    /** Empty when the reader could not tell which item was voted; the app then reports the statement. */
    items: ItemRange[];
    outcome: StatedOutcome | null;
    /** The outcome as stated: «Άρα κατά πλειοψηφία», the sheet's own mark. */
    phrase: string;
    /** Counts printed or spoken, per vote value; absent when none are. */
    tally?: Partial<Record<VoteValue, number | null>>;
    namedVotes: Array<{ name: string; personId: string | null; vote: VoteValue; rawText: string; utteranceId: string | null }>;
    /**
     * A party answering for its members («Εμείς κατά»). `party` is the party as
     * named, or null when it is the speaker's own; `speakerUtteranceId` names the
     * utterance whose speaker's party it is. opencouncil resolves the members
     * present at that item.
     */
    partyVotes: Array<{ party: string | null; speakerUtteranceId: string | null; vote: VoteValue; rawText: string }>;
    rawText: string;
    utteranceIds: string[];
    line: number | null;
    /** 0–100, the reader's own confidence that this is a vote of this meeting on these items. */
    confidence: number;
}

/** What one source states about a meeting, matched to ids. */
export interface MeetingFactsReading {
    rollCall: { entries: StatedRollCallEntry[]; rawText: string; utteranceIds: string[] } | null;
    attendanceChanges: MeetingFactsChange[];
    votes: StatedVote[];
    presidedBy: { name: string; personId: string | null; rawText: string } | null;
    /** How each name the source states was matched: by token-sort, by the model, or not at all. */
    nameMatches: Array<{ name: string; personId: string | null; method: 'token' | 'llm' | null }>;
    unmatchedNames: string[];
    warnings: DecisionWarning[];
}

/** An agenda item as the meeting knows it, for anchoring statements. */
export interface MeetingAgendaItem {
    name: string;
    /** Null for a non-agenda item. */
    agendaItemIndex: number | null;
    /** The 1-based position among the out-of-agenda items; null otherwise. */
    outOfAgendaOrdinal: number | null;
}

/*
 * Task: Read Attendance Sheet
 */

export interface ReadAttendanceSheetRequest extends TaskRequest {
    /** A URL the task server can fetch without credentials for a short time: the app presigns it. */
    fileUrl: string;
    /** The file's media type; the reader sends a PDF as a document and anything else as an image. */
    mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    cityName: string;
    cityLanguage: CityLanguage;
    administrativeBodyName: string | null;
    /** ISO date (YYYY-MM-DD) of the meeting. */
    date: string;
    roster: RosterPerson[];
    agendaItems: MeetingAgendaItem[];
    mayorId?: string;
    /** How this body's sheet is laid out, in a person's words; absent for a body nobody described. */
    layoutNotes?: string | null;
    /** Read the file again rather than return the reading cached for it: a person asked to read it again. */
    forceRead?: boolean;
}

export interface ReadAttendanceSheetResult {
    reading: MeetingFactsReading;
    usage: TaskTokenUsage;
}

/*
 * Task: Read Transcript Facts
 *
 * The same pass fixTranscript runs; on its own for a rerun after review.
 */

export interface ReadTranscriptFactsRequest extends RequestOnTranscript {
    agendaItems?: MeetingAgendaItem[];
}

export interface ReadTranscriptFactsResult {
    reading: MeetingFactsReading;
    usage: TaskTokenUsage;
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

export type VoteValue = 'FOR' | 'AGAINST' | 'ABSTAIN' | 'PRESENT' | 'DID_NOT_VOTE';

/** The roll call as printed on one page, with the ids the names resolved to (task v4). */
export interface DocumentRollCall {
    layout: 'composition_and_absent' | 'present_and_absent';
    composition: string[];
    present: string[];
    absent: string[];
    presentIds: string[];
    absentIds: string[];
}

/**
 * What one document states, matched to ids — the mirror of opencouncil-tasks'
 * ExtractedDecisionResult (task v4). The v3 fields stay optional so results
 * stored by older task versions still parse; nothing derives from them.
 */
export interface ExtractedDecisionData {
    subjectId: string;
    excerpt: string;
    references: string;
    /** The decision's own number (Αρ. Απόφασης / Πράξη), extracted from the document. */
    decisionNumber?: string | null;
    subjectInfo: { number: number; isOutOfAgenda: boolean } | null;
    /** The extractor did not reach ΑΠΟΦΑΣΙΖΕΙ (v4; v3 signals it through warnings). */
    incomplete?: boolean;
    rollCall?: DocumentRollCall | null;
    mayorPresent?: boolean | { present: boolean; rawText: string } | null;
    presidedBy?: { name: string; personId: string | null; rawText: string } | null;
    /** Who kept the minutes in the secretary's place, when the page says so (task v4 from 2026-09-22). */
    actingSecretary?: { name: string; personId: string | null; rawText: string } | null;
    /** The item heading as printed; "" when the page prints none. Absent on readings stored before 2026-09-22. */
    subjectHeading?: string;
    /** The page's own list of who was present for THIS decision (ΤΑ ΜΕΛΗ after the decision text), never the opening roll call (v4). */
    decisionAttendance?: { present: string[]; presentIds: string[]; rawText: string } | null;
    voteResult: string | null;
    voteTally?: Record<VoteValue, number | null>;
    voteDetails: { personId: string; name?: string; vote: VoteValue }[];
    /** The changes this document states (v4): arrivals, departures and per-vote absences (`absent_for_vote`). A reading stored before `absent_for_vote` holds a per-vote absence as a departure/arrival pair. */
    attendanceChanges?: PollDecisionsAttendanceEvent[];
    unmatchedMembers: string[];
    /** How each name was matched (task v4 from C1); absent on older readings. */
    nameMatches?: { name: string; personId: string | null; method: 'token' | 'llm' | null }[];
    fromCache?: boolean;
    warnings?: DecisionWarning[];
    /** @deprecated task v3: replayed snapshot; ignored. */
    presentMemberIds?: string[];
    /** @deprecated task v3: replayed snapshot; ignored. */
    absentMemberIds?: string[];
    /** @deprecated task v3; ignored. */
    absentForVoteIds?: string[];
    /** @deprecated Diavgeia's protocol number is mirrored at match time. */
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
        /** The agenda item title when the subject has one, else the summary name. */
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: string | null;
        existingDecision?: {
            ada?: string; // absent for a decision that is not on Diavgeia
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
     * window, plus this meeting's own open candidates (`own`). Presence +
     * readStatus decide whether tasks reads again; meetingDate decides which
     * partition the decision belongs to. Tasks fetches an `own` candidate that
     * its window does not return.
     */
    knownDecisions?: Array<{ ada: string; meetingDate: string | null; readStatus: string; own?: boolean }>;
    /** The body's conventions rendered as sentences for the prompt; opencouncil owns the glossary. */
    conventionsText?: string | null;
    /**
     * false = match and link only, read no page: the body has no conventions
     * record. Absent = extract, for a request from an older app.
     */
    extract?: boolean;
    lookupAdas?: string[]; // typed ΑΔΑ values, fetched outside the poll scope
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

/**
 * Token usage a task reports with its result. Mirrors opencouncil-tasks
 * `TaskTokenUsage` in `src/types.ts`: one shape for every task, so the two
 * results that carry it cannot drift apart one field at a time.
 */
export interface TaskTokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
}

export interface PollDecisionsAttendanceEvent {
    personId: string | null;
    name: string;
    /**
     * `absent_for_vote`: the page states the member was out of the room for a
     * vote — this page's decision (anchor `subject` or `this_document`), or the
     * range of decisions the anchor names (`decision_number` to `decisionNumberTo`).
     * A reading stored before this value existed carries it as a departure before
     * and an arrival after the page's own subject, with one rawText.
     */
    type: 'arrival' | 'departure' | 'absent_for_vote';
    anchor: {
        kind: 'agenda_item' | 'decision_number' | 'subject' | 'phase' | 'session_start' | 'session_end' | 'clock_time' | 'session_phase' | 'this_document';
        agendaItemIndex: number | null;
        nonAgendaReason: 'outOfAgenda' | null;
        decisionNumber: string | null;
        /** The last decision of a range the page names («στις με αρ. 31 – 40»), for kind `decision_number`; absent or null otherwise. */
        decisionNumberTo?: string | null;
        /** The document's own subject, for kind `subject`. */
        subjectId?: string | null;
        phase: 'pre_agenda' | 'out_of_agenda' | string | null;
        timing: 'before' | 'during' | 'after' | null;
    };
    rawText: string;
    reportingPdfCount: number;
    totalPdfCount: number;
}

/** What the tasks server found for one typed ΑΔΑ. */
export interface PollDecisionsLookup {
    ada: string;
    outcome: 'found' | 'not_found' | 'error';
    organizationId: string | null;
    /** Set only when the document belongs to another organization than the city's. */
    organizationLabel: string | null;
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
    } | null;
    usage: TaskTokenUsage;
    metadata?: {
        diavgeiaUid: string;
        query: object;
        fetchedCount: number;
        matchedCount: number;
        unmatchedCount: number;
        ambiguousCount: number;
    };
    lookups?: PollDecisionsLookup[]; // absent from older tasks versions and from polls with no lookupAdas
}
