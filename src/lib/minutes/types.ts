export interface MinutesMember {
    personId: string;
    name: string;
    party: string | null;
    isPartyHead: boolean;
    role: string | null;
}

export interface MinutesAttendance {
    present: MinutesMember[];
    absent: MinutesMember[];
}

export interface MinutesCouncilComposition {
    mayor: { name: string; personId: string } | null;
    president: { name: string; personId: string } | null;
    members: MinutesMember[];
    /** Substitute members (αναπληρωματικά μέλη) — only for committees */
    substituteMembers: MinutesMember[];
}

export interface MinutesVoteResult {
    forMembers: MinutesMember[];
    againstMembers: MinutesMember[];
    abstainMembers: MinutesMember[];
    /** Members who declared physical presence but did not participate in the vote (ΠΑΡΩΝ) */
    presentMembers: MinutesMember[];
    /** Members who declined to participate (ΑΠΟΧΗ) */
    didNotVoteMembers: MinutesMember[];
    absentMembers: MinutesMember[];
    passed: boolean;
    isUnanimous: boolean;
}

export interface MinutesSpeakerEntry {
    type: 'speaker';
    speakerName: string;
    party: string | null;
    isPartyHead: boolean;
    role: string | null;
    text: string;
    timestamp: number;
}

export interface MinutesGapSubject {
    id: string;
    name: string;
}

export interface MinutesGapEntry {
    type: 'gap';
    durationSeconds: number;
    subjects: MinutesGapSubject[];
}

export type MinutesTranscriptEntry = MinutesSpeakerEntry | MinutesGapEntry;

export interface MinutesSubject {
    subjectId: string;
    agendaItemIndex: number | null;
    nonAgendaReason: 'beforeAgenda' | 'outOfAgenda' | null;
    withdrawn: boolean;
    name: string;

    discussedWith: { id: string; name: string; agendaItemIndex: number | null } | null;

    decision: {
        protocolNumber: string | null;
        excerpt: string | null;
        references: string | null;
    } | null;

    attendance: MinutesAttendance | null;
    voteResult: MinutesVoteResult | null;
    /** Orphaned utterances that fall between the previous subject and this one */
    preDiscussionEntries: MinutesTranscriptEntry[];
    transcriptEntries: MinutesTranscriptEntry[];
}

export interface MinutesData {
    city: {
        name: string;
        name_municipality: string;
        timezone: string;
        logoImage: string | null;
    };
    meeting: {
        id: string;
        cityId: string;
        name: string;
        dateTime: string; // ISO string for JSON serialization
    };
    administrativeBody: { name: string; type: string } | null;
    councilComposition: MinutesCouncilComposition | null;
    /** Members absent at the start of the meeting (initial roll call) */
    absentMembers: MinutesMember[] | null;
    /** Orphaned utterances before the first subject (opening remarks, procedural content) */
    preambleEntries: MinutesTranscriptEntry[];
    subjects: MinutesSubject[];
    /** Orphaned utterances after the last subject (closing remarks) */
    epilogueEntries: MinutesTranscriptEntry[];
}
