import type { NonAgendaReason, Realm } from '@prisma/client';
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

/**
 * What the transcript holds for a subject, in the terms of DiscussionStatus.
 * `start` is where the subject sits in the meeting: the first utterance that
 * is not a procedural vote, or the first procedural vote when that is all
 * there is — the same rule `sortSubjectsByDiscussionOrder` receives.
 */
export interface MinutesDiscussionSummary {
    /**
     * 'discussed' = SUBJECT_DISCUSSION present; 'voteOnly' = only VOTE; 'other'
     * = linked utterances exist but none is SUBJECT_DISCUSSION or VOTE
     * (ATTENDANCE, OTHER, null status, or only PROCEDURAL_VOTE); 'none' = no
     * linked utterance at all.
     */
    kind: 'discussed' | 'voteOnly' | 'other' | 'none';
    /** Seconds of SUBJECT_DISCUSSION utterances. 0 unless kind is 'discussed'. */
    seconds: number;
    /** Timestamp in seconds, null when the subject has no linked utterance. */
    start: number | null;
}

export interface MinutesSpeakerEntry {
    type: 'speaker';
    speakerName: string;
    party: string | null;
    isPartyHead: boolean;
    role: string | null;
    text: string;
    timestamp: number;
    /** Debug: DiscussionStatus of the first utterance in this block */
    debugStatus?: string | null;
    /** Debug: discussionSubjectId of the first utterance in this block */
    debugSubjectId?: string | null;
}

export interface MinutesCrossSubjectEntry {
    type: 'cross-subject';
    /** 'start' = beginning of cross-subject block, 'end' = return to original subject */
    direction: 'start' | 'end';
    subject: { id: string; name: string };
}

export type MinutesTranscriptEntry = MinutesSpeakerEntry | MinutesCrossSubjectEntry;

/**
 * Every subject name inside `MinutesData` is the item as written on the official
 * agenda, when the subject has one. Otherwise it is the summary name. This
 * includes the cross-reference names: `MinutesCrossSubjectEntry.subject.name`
 * and `MinutesAttendanceChange.atSubject.name`. `getMinutesData` resolves the
 * name once, through `agendaItemTitleOrName`.
 */
export interface MinutesSubject {
    subjectId: string;
    agendaItemIndex: number | null;
    nonAgendaReason: NonAgendaReason | null;
    withdrawn: boolean;
    name: string;

    discussedWith: {
        id: string;
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: NonAgendaReason | null;
    } | null;

    /** Subjects whose discussion partially occurred within another subject's section */
    discussedElsewhere: Array<{
        subjectId: string;
        name: string;
        agendaItemIndex: number | null;
    }> | null;

    decision: {
        /** The number the decision carries. Rendered as Αρ. Απόφασης. */
        decisionNumber: string | null;
        /** Diavgeia's protocol number. Municipality-defined; not necessarily the decision number. */
        protocolNumber: string | null;
        excerpt: string | null;
        references: string | null;
    } | null;

    attendance: MinutesAttendance | null;
    voteResult: MinutesVoteResult | null;
    discussion: MinutesDiscussionSummary;
    /** Orphaned utterances that fall between the previous subject and this one */
    preDiscussionEntries: MinutesTranscriptEntry[];
    transcriptEntries: MinutesTranscriptEntry[];
}

export interface MinutesAttendanceChange {
    personId: string;
    name: string;
    type: 'arrival' | 'departure';
    /** The agenda item where this change is first observed (subject immediately after the change) */
    atSubject: {
        id: string;
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: NonAgendaReason | null;
        /** Sequential number among out-of-agenda subjects (1-based), null for regular items */
        outOfAgendaIndex: number | null;
    };
}

/**
 * When a subject's procedural vote happened: the vote to admit an out-of-agenda
 * item, or to withdraw or postpone one. One per subject, at its first
 * PROCEDURAL_VOTE utterance. These votes never place a subject in the discussion
 * order — the decisions page reads the timestamp to date a withdrawal.
 *
 * Carries the id and the time only. Everything else about the subject is on the
 * `MinutesSubject` the id names, and this payload ships whole to the browser.
 */
export interface MinutesProceduralVote {
    subjectId: string;
    timestamp: number;
}

export interface MinutesData {
    city: {
        name: string;
        name_municipality: string;
        timezone: string;
        logoImage: string | null;
        /** Owns the domain the printed link points at. */
        realm: Realm;
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
    /** Mid-meeting arrivals and departures derived from per-subject attendance diffs */
    attendanceChanges: MinutesAttendanceChange[];
    /** Discussion order summary, only set when subjects were discussed out of natural order */
    discussionOrderLabel: string | null;
    /** Procedural votes in time order. Empty when the transcript has none. */
    proceduralVotes: MinutesProceduralVote[];
    subjects: MinutesSubject[];
    /** Orphaned utterances after the last subject (closing remarks) */
    epilogueEntries: MinutesTranscriptEntry[];
}
