import type { NonAgendaReason, Realm } from '@prisma/client';
import type { PhraseOutcome } from '@/lib/derivation/deriveVotes';
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
    /**
     * `note` is the parenthesis printed after the name on the ΔΗΜΑΡΧΟΣ line, or on
     * the ΠΡΟΕΔΡΟΣ line of a committee the mayor presides: absence at the roll call, and the mayor's own arrivals and departures.
     * Who presided in an absent president's place is `presidedBy`. Null when there is nothing to say — the
     * renderers then fall back to the ΑΠΩΝ/ΑΠΟΥΣΑ label they derive themselves.
     */
    mayor: { name: string; personId: string; note: string | null } | null;
    president: { name: string; personId: string } | null;
    /**
     * Who presided, as the documents state it: the first document that names
     * one (its `presidedBy`). The name is the roster name when the document's
     * name resolved to a person, else the name as the document printed it.
     * `buildRollCall` names this person on the ΠΡΟΕΔΡΟΣ line when the president
     * was absent and this is someone else. Absent or null when no document names one.
     */
    presidedBy?: { name: string; personId: string | null } | null;
    members: MinutesMember[];
    /** Substitute members (αναπληρωματικά μέλη) — only for committees */
    substituteMembers: MinutesMember[];
}

/** The office a roll-call list prints after an absent president's name: «ΠΡΟΕΔΡΟΣ», with «ΔΗΜΑΡΧΟΣ» when the president is the mayor. */
export interface MinutesRollCallOffice {
    isMayor: boolean;
    /** For the languages whose word for the office has a feminine form. */
    feminine: boolean;
}

/** A member on a roll-call list, and whether they sit as a substitute (αναπληρωματικό μέλος). */
export interface MinutesRollCallMember {
    member: MinutesMember;
    isSubstitute: boolean;
    /** Set on the absent president's entry of the absent list, null on every other entry. */
    office: MinutesRollCallOffice | null;
}

/**
 * The roll call as the minutes print it, before a renderer draws it: the DOCX,
 * the on-screen minutes and the decisions page all read these lines from
 * `buildRollCall`.
 *
 * `note` is the parenthesis the documents give (the mayor's note); `printedNote`
 * is what the minutes print in its place, which falls back to ΑΠΩΝ/ΑΠΟΥΣΑ.
 * A renderer in another language prints `note` and its own word for absent.
 */
export interface MinutesRollCall {
    isCommittee: boolean;
    /**
     * The ΔΗΜΑΡΧΟΣ line. Councils only: a committee counts a member mayor in its
     * lists and names the mayor on the president's line, when the mayor presides.
     * `feminine` picks the gendered word for absent.
     */
    mayor: { name: string; personId: string; absent: boolean; feminine: boolean; note: string | null; printedNote: string | null } | null;
    /**
     * The ΠΡΟΕΔΡΟΣ line. `name` and `personId` are the president's. `isMayor`: a
     * committee's president is the mayor, and the line prints «(ΔΗΜΑΡΧΟΣ)» after
     * the name, then the mayor's note, as the minutes print it. The note holds the
     * mayor's arrivals and departures, and the changes list then leaves them out.
     *
     * `presidedBy`: the president was absent and a document names another person
     * who presided. The line then names that person first, and the parenthesis
     * says that the president (the mayor, when `isMayor`) was absent:
     * «ΠΡΟΕΔΡΟΣ: Μετικαρίδης Θεόδωρος (λόγω απουσίας της ΠΡΟΕΔΡΟΥ, ΔΗΜΑΡΧΟΥ Καφατσάκη Τίνα)».
     * The president is then in the absent list, and the line carries no mayor's note.
     * `feminine` picks the gendered words.
     *
     * `printedName` and `printedNote` are the line as the minutes print it.
     */
    president: {
        name: string;
        personId: string;
        absent: boolean;
        isMayor: boolean;
        feminine: boolean;
        presidedBy: { name: string; personId: string | null } | null;
        note: string | null;
        printedName: string;
        printedNote: string | null;
    } | null;
    /**
     * Committee: the ΠΑΡΟΝΤΑ ΜΕΛΗ list, substitutes after their party. Council:
     * the members of the ΣΥΝΘΕΣΗ who are not absent.
     */
    present: MinutesRollCallMember[];
    /**
     * Committee: the ΑΠΟΝΤΑ ΜΕΛΗ list. Council: the «απουσίαζαν οι» sentence,
     * which leaves out an absent president whose own line says they were absent.
     * An absent president whose line names who presided is in the list, with
     * `office` set.
     */
    absent: MinutesRollCallMember[];
}

/** The lists a vote result prints, one per vote value. All empty when the document named no voter. */
export interface MinutesVoteMembers {
    forMembers: MinutesMember[];
    againstMembers: MinutesMember[];
    abstainMembers: MinutesMember[];
    /** Members who declared physical presence but did not participate in the vote (ΠΑΡΩΝ) */
    presentMembers: MinutesMember[];
    /** Members who declined to participate (ΑΠΟΧΗ) */
    didNotVoteMembers: MinutesMember[];
    absentMembers: MinutesMember[];
}

/**
 * A counted result, or — when the document named no voter — what its own phrase
 * says. The two carry different outcome fields, because a phrase-only result has
 * no counts to read `passed` or a unanimity off: «Κατά πλειοψηφία απορρίπτει»
 * did not pass, and a phrase that counts votes without naming an outcome is
 * neither unanimous nor a majority. Its member lists are empty because nobody
 * was counted, not because nobody voted.
 */
export type MinutesVoteResult = MinutesVoteMembers & (
    | { fromPhraseOnly: false; passed: boolean; isUnanimous: boolean }
    | {
        fromPhraseOnly: true;
        /** The outcome the phrase names, null when it names none. */
        outcome: PhraseOutcome | null;
        /** The phrase as the document wrote it, printed whole when it names no outcome. */
        phrase: string;
    }
);

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
        /** What the document itself says about the vote («Ομόφωνα»), verbatim. */
        voteResultPhrase: string | null;
    } | null;

    /**
     * Who presided at this subject: the `presidedBy` of this subject's own
     * document, else the meeting's (`MinutesCouncilComposition.presidedBy`).
     * The subject's roll call (`buildRollCall`) names this person on the
     * ΠΡΟΕΔΡΟΣ line when the president was absent. The meeting's own roll call
     * keeps the meeting's value.
     */
    presidedBy: { name: string; personId: string | null } | null;

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
    /**
     * What the document pinned the change to when it is not an agenda item
     * («στην 286 ΑΚΣ», «στις 19:45»); printed instead of the subject label.
     * Null when the change is reconstructed from attendance diffs.
     */
    anchorLabel?: string | null;
    /** The sentence the document states the change in. Absent for changes reconstructed from attendance diffs. */
    rawText?: string;
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
    /** Mid-meeting arrivals and departures */
    attendanceChanges: MinutesAttendanceChange[];
    /**
     * Where `attendanceChanges` came from: 'events' = the arrivals and
     * departures the documents state, 'diff' = reconstructed by diffing
     * per-subject attendance (meetings polled before events were stored).
     */
    attendanceChangesSource: 'events' | 'diff';
    /** Discussion order summary, only set when subjects were discussed out of natural order */
    discussionOrderLabel: string | null;
    /** Procedural votes in time order. Empty when the transcript has none. */
    proceduralVotes: MinutesProceduralVote[];
    subjects: MinutesSubject[];
    /** Orphaned utterances after the last subject (closing remarks) */
    epilogueEntries: MinutesTranscriptEntry[];
}
