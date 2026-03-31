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

export interface MinutesOfficialRole {
    name: string;
    present: boolean;
}

export interface MinutesCouncilComposition {
    mayor: MinutesOfficialRole | null;
    president: MinutesOfficialRole | null;
    members: MinutesMember[];
}

export interface MinutesVoteResult {
    forMembers: MinutesMember[];
    againstMembers: MinutesMember[];
    abstainMembers: MinutesMember[];
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
    name: string;

    discussedWith: { id: string; name: string; agendaItemIndex: number | null } | null;

    decision: {
        protocolNumber: string | null;
        excerpt: string | null;
        references: string | null;
    } | null;

    attendance: MinutesAttendance | null;
    voteResult: MinutesVoteResult | null;
    transcriptEntries: MinutesTranscriptEntry[];
}

export interface MinutesData {
    city: {
        name: string;
        name_municipality: string;
        timezone: string;
    };
    meeting: {
        id: string;
        cityId: string;
        name: string;
        dateTime: string; // ISO string for JSON serialization
    };
    administrativeBody: string | null;
    councilComposition: MinutesCouncilComposition | null;
    subjects: MinutesSubject[];
}
