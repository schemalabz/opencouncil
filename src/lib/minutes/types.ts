export interface MinutesMember {
    personId: string;
    name: string;
    party: string | null;
    role: string | null;
}

export interface MinutesAttendance {
    present: MinutesMember[];
    absent: MinutesMember[];
}

export interface MinutesVoteResult {
    forMembers: MinutesMember[];
    againstMembers: MinutesMember[];
    abstainMembers: MinutesMember[];
    passed: boolean;
    isUnanimous: boolean;
}

export interface MinutesTranscriptEntry {
    speakerName: string;
    party: string | null;
    role: string | null;
    text: string;
    timestamp: number;
}

export interface MinutesSubject {
    subjectId: string;
    agendaItemIndex: number | null;
    nonAgendaReason: 'beforeAgenda' | 'outOfAgenda' | null;
    name: string;

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
    overallAttendance: MinutesAttendance | null;
    subjects: MinutesSubject[];
}
