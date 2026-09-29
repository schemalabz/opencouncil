import type {
    AdministrativeBodyType, AttendanceAnchorKind, AttendanceEventKind, AttendancePhase, AttendanceStatus,
    AttendanceTiming, DataSource, NonAgendaReason, VoteType,
} from '@prisma/client';
import type { DecisionConventions, NamedVoters, RollCallLayout } from '@/lib/decisionConventions';

/** A subject in the transcript-derived order, withdrawn ones excluded. */
export interface OrderedSubject {
    id: string;
    name: string;
    agendaItemIndex: number | null;
    nonAgendaReason: NonAgendaReason | null;
    decisionNumber: string | null;
}

export interface RollCallRow {
    personId: string;
    status: AttendanceStatus;
    source: DataSource;
    /** The sheet says whether the absence was justified; null where the source does not say. */
    absenceJustified?: boolean | null;
    rawText?: string;
    evidence?: Evidence;
}

/**
 * Where a statement can be checked: the recording at an utterance, a line of the
 * sheet, a decision document. An issue carries the evidence of the statement it
 * reports, so the page can open the recording at that moment, the sheet at that
 * line, or the document.
 */
export interface Evidence {
    utteranceId?: string;
    /** The line of the sheet, counted from 1 as its reader numbered it. */
    line?: number;
    decisionId?: string;
}

/** An AttendanceEvent row, as stored. */
export interface EventRow {
    id: string;
    personId: string;
    kind: AttendanceEventKind;
    anchorKind: AttendanceAnchorKind;
    anchorAgendaItemIndex: number | null;
    anchorNonAgendaReason: NonAgendaReason | null;
    anchorDecisionNumber: string | null;
    anchorSubjectId: string | null;
    anchorPhase: AttendancePhase | null;
    timing: AttendanceTiming | null;
    rawText: string;
    /** How many of the session's documents stated it, out of how many were read. */
    reportingDocuments: number;
    totalDocuments: number;
    source: DataSource;
    /** Where the statement can be checked; absent on a row read back from the database. */
    evidence?: Evidence;
}

/** A change one page states, before the session resolves it. */
export type StatedChange = Omit<EventRow, 'id' | 'reportingDocuments' | 'totalDocuments' | 'source'>;

/** The outcome a source states in its own words, when it names one. */
export type StatedOutcomeWord = 'unanimous' | 'majority' | 'rejected';

/**
 * A vote as one source states it for one subject: what `deriveVotes` reads. A
 * page's is read off its `DocumentFacts`; a sheet's or the transcript's is read
 * off its reading, one entry per subject the statement covers.
 */
export interface VoteFacts {
    subjectId: string;
    source: DataSource;
    /** The page, for a page's statement; null for the other sources. */
    decisionId: string | null;
    /** The vote phrase as the source states it; the outcome is read from it. */
    voteResultPhrase: string | null;
    /** The outcome the source states in its own words, when the phrase alone does not name one. */
    statedOutcome: StatedOutcomeWord | null;
    namedVotes: Array<{ personId: string; vote: VoteType; evidence?: Evidence }>;
    /**
     * A party answering for its members («Εμείς κατά»): the party as the source
     * names it, and the party of the speaker where the source names none. The
     * members present at the subject get the vote, once presence is replayed.
     */
    partyVotes: Array<{ partyId: string | null; vote: VoteType; rawText: string; evidence?: Evidence }>;
    tally: VoteTally | null;
    rawText: string | null;
    evidence?: Evidence;
}

/**
 * What one source other than the pages states about the meeting, shaped for the
 * derivation: the sheet a back office keeps, or the transcript. Read off
 * `MeetingFactSource.reading` by `sourceFactsFromReading` (./sources.ts).
 */
export interface SourceFacts {
    source: DataSource;
    /** The roll call as the source states it; null when it states none. */
    rollCall: RollCallRow[] | null;
    statedChanges: Array<StatedChange & { evidence?: Evidence }>;
    /** The votes, one entry per subject a statement covers. */
    votes: VoteFacts[];
    /** Statements the source makes about a vote that names no item the meeting has. */
    unplacedVotes: Array<{ rawText: string; evidence?: Evidence }>;
    presidedById: string | null;
    presidedByName: string | null;
    nameMatches: NameMatch[] | null;
    unmatchedNames: string[];
}

/**
 * A member a page states was out of the room for a vote: for this page's own
 * decision, or for a range of decisions the page names («Εκτός αιθούσης στις με
 * αρ. 31 – 40 ΑΔΣ»). It is not a change of its own: the session's resolution
 * combines the statements of every page into departures and arrivals.
 */
export interface PerVoteAbsence {
    personId: string;
    /** The first and the last decision of the range, as printed; both null for this page's own decision. */
    decisionNumberFrom: string | null;
    decisionNumberTo: string | null;
    rawText: string;
}

/** How one name on a page was matched to the roster (task v4 from C1); `method` is null when nothing matched. */
export interface NameMatch { name: string; personId: string | null; method: 'token' | 'llm' | null }

export type VoteTally = Partial<Record<VoteType, number | null>>;

/** What one document states, read off the Decision row and its raw extraction. */
export interface DocumentFacts {
    subjectId: string;
    decisionId: string;
    voteResultPhrase: string | null;
    namedVotes: Array<{ personId: string; vote: VoteType }>;
    tally: VoteTally | null;
    /** The document's own present list as ids (task v4), null for older reads and for a document that states none. */
    presentIds: string[] | null;
    /** This document's own top roll call, for bodies whose ΠΑΡΟΝΤΕΣ is the state as of each decision (`per_decision`); null when the page printed none. */
    rollCallPresentIds: string[] | null;
    rollCallAbsentIds: string[] | null;
    /** Always null today: no source states a per-decision absent list. A clerk's sheet would. */
    absentIds: string[] | null;
    /** The names each list prints on this page, as printed: the roll call's two lists and ΤΑ ΜΕΛΗ after the decision. */
    lists: { rollCallPresent: string[]; rollCallAbsent: string[]; decisionPresent: string[] };
    /** The changes this page states about a person on the roster; empty for a reading that states no facts. */
    statedChanges: StatedChange[];
    /** The members this page states out of the room for a vote; not in `statedChanges`. */
    perVoteAbsences: PerVoteAbsence[];
    /** How each name on this page was matched, or null for a reading that predates the field. */
    nameMatches: NameMatch[] | null;
    unmatchedNames: string[];
    incomplete: boolean;
    /** The layout this one page printed its roll call in; null when it printed none or was read before v4. */
    rollCallLayout: RollCallLayout | null;
    /** The item the document says it decided, and whether it says that item was taken out of agenda. */
    declaredItemNumber: number | null;
    declaredOutOfAgenda: boolean | null;
    mayorPresent: boolean | null;
    presidedById: string | null;
    presidedByName: string | null;
    /** The person the document says kept the minutes in the secretary's place; the list leaves them out where it leaves the secretary out. */
    actingSecretaryId: string | null;
    /** The page's reading states facts: `readingStatesFacts` accepts its version (v4 or later). */
    hasExtraction: boolean;
    /** The page's decision text says ΑΠΟΦΑΣΙΖΕΙ: the body decided by a vote. A mayor's decision says ΑΠΟΦΑΣΙΖΟΥΜΕ. */
    statesBodyDecision: boolean;
    /** The reader warned CLOSING_BLOCK_CUT: the member list or the signatures continue past the pages it read. */
    closingBlockCut: boolean;
    /** The reader warned CLOSING_READ_FAILED: the pages after the decision could not be read. */
    closingReadFailed: boolean;
}

export interface DerivationInput {
    cityId: string;
    meetingId: string;
    subjects: OrderedSubject[];
    /** Stated roll-call rows of source `manual`. The pages' own roll call is resolved (resolveSession); the other sources' come with `sources`. */
    rollCall: RollCallRow[];
    /** Stated events of source `manual`; the pages' own are resolved, the other sources' come with `sources`. */
    events: EventRow[];
    documents: DocumentFacts[];
    /** The sheet and the transcript, where the meeting has a reading of them. */
    sources: SourceFacts[];
    /** The members of each party on the meeting date, for a party's answer on a vote. */
    partyMembers: Map<string, string[]>;
    /** Subjects holding decision-sourced vote rows now: what a write replaces and, for an unread document, cannot rebuild. */
    subjectIdsWithStoredVotes: string[];
    conventions: DecisionConventions | null;
    mayorPersonId: string | null;
    /** The head of the meeting's body on its date. */
    presidentPersonId: string | null;
    /** The body's secretary on its date, when `listOmitsSecretary` is set; null otherwise. */
    secretaryPersonId: string | null;
    /** The body's type: the mayor sits only on a committee («The mayor» in docs/guides/meeting-minutes.md). */
    bodyType: AdministrativeBodyType | null;
    /** The city's mayor on the meeting date, whatever the body. `mayorPersonId` is the mayor only where left out of the rows. */
    cityMayorPersonId: string | null;
}

/**
 * What the derivation could not settle. Each code is also its message key: the
 * one authored explanation of the code lives under `decisionsPage.issues.messages`
 * in messages/<locale>/admin.json, beside the short label under `issues.codes`.
 * `renderIssue` (./issueText.ts) renders one; `IssueParams` below says what it
 * interpolates.
 */
export const ISSUE_CODES = [
    'NO_ROLL_CALL', 'PRESENCE_UNKNOWN', 'CONVENTIONS_UNCONFIRMED', 'UNMATCHED_NAME', 'UNPLACEABLE_ANCHOR',
    'IMPLIED_CHANGE', 'TALLY_MISMATCH', 'INCOMPLETE_READ', 'PRESIDING_DISAGREES', 'SOURCES_DISAGREE', 'NO_STORED_FACTS',
    'LAYOUT_DISAGREES', 'ITEM_NUMBER_DISAGREES', 'UNREAD_DOCUMENT', 'LIST_DROPS_PRESENT', 'LIST_ADDS_ABSENT',
    'PERSON_IN_BOTH_LISTS', 'CHANGE_NOT_CORROBORATED', 'LATE_ARRIVAL_IN_OPENING_LIST', 'NAMED_VOTERS_UNEXPECTED',
    'NAMES_SHARE_ID', 'NAME_MATCHED_TWICE', 'OUT_OF_AGENDA_PLACED_FIRST',
    'VOTE_BY_ABSENT_MEMBER', 'NO_VOTE_RESULT', 'LIST_CUT', 'CLOSING_BLOCK_CUT', 'CLOSING_READ_FAILED', 'UNPLACEABLE_VOTE', 'PARTY_VOTE_UNRESOLVED',
] as const;
export type IssueCode = typeof ISSUE_CODES[number];

/** One vote type the printed count and the derived rows disagree about. */
export interface TallyDiff { type: VoteType; printed: number; derived: number }

/** Who one document says presided: the person the name matched, and the name as printed. */
export interface PresidingStatement { personId: string | null; name: string | null }

/** Which disagreement SOURCES_DISAGREE reports; its message selects on `kind`. */
export type SourcesDisagreeParams =
    | { kind: 'event'; winKind: AttendanceEventKind; winRawText: string; winSource: DataSource; loseRawText: string; loseSource: DataSource }
    | { kind: 'statedList'; status: AttendanceStatus; eventKind: AttendanceEventKind; rawText: string }
    | { kind: 'doubleVote'; firstVote: VoteType; secondVote: VoteType }
    /** Two sources state a different roll-call status for one member; the higher-precedence one stands. */
    | { kind: 'rollCall'; winSource: DataSource; winStatus: AttendanceStatus; loseSource: DataSource; loseStatus: AttendanceStatus }
    /** Two sources state the same kind of change for one member at different points of the order; the higher-precedence one stands. */
    | { kind: 'eventPosition'; winSource: DataSource; winRawText: string; loseSource: DataSource; loseRawText: string }
    /** Two sources state a different outcome for one subject's vote. */
    | { kind: 'outcome'; winSource: DataSource; winOutcome: string; loseSource: DataSource; loseOutcome: string }
    /** Two sources state a different vote for one member on one subject. */
    | { kind: 'vote'; winSource: DataSource; winVote: VoteType; loseSource: DataSource; loseVote: VoteType };

/**
 * What each code's message interpolates. A code raised in more than one
 * situation carries the discriminator its message selects on (`reason`, `kind`),
 * so the situations stay distinct without the code losing its single entry.
 */
export interface IssueParams {
    NO_ROLL_CALL: { reason: 'noRollCall' | 'noMajority' };
    PRESENCE_UNKNOWN: { reason: 'assumedOpening' };
    CONVENTIONS_UNCONFIRMED: Record<string, never>;
    UNMATCHED_NAME: { name: string };
    UNPLACEABLE_ANCHOR: {
        kind: AttendanceEventKind;
        reason: 'noAgendaItem' | 'noSuchAgendaItem' | 'noSuchSubject' | 'decisionNumberNoDigits' | 'noDecisionNumbers' | 'decisionNumberBeyond'
            | 'rangeNotInMeeting' | 'rangeNoDecisionNumbers' | 'rangeNumberNoDigits';
        /** The anchor the reason names — «#3», «OA1», a subject id (`nameIssue` names it), a decision number — empty when it names none. */
        detail: string;
    };
    IMPLIED_CHANGE: { status: AttendanceStatus };
    TALLY_MISMATCH: { diffs: TallyDiff[] };
    INCOMPLETE_READ: Record<string, never>;
    /** The distinct statements, compared by person where the name matched one; the page names each from its people (`nameIssue`). */
    PRESIDING_DISAGREES: { presiding: PresidingStatement[] };
    SOURCES_DISAGREE: SourcesDisagreeParams;
    NO_STORED_FACTS: { missing: number; total: number };
    LAYOUT_DISAGREES: { expected: RollCallLayout; found: RollCallLayout };
    ITEM_NUMBER_DISAGREES: { declared: number; linked: number };
    UNREAD_DOCUMENT: Record<string, never>;
    /**
     * Both are the document's own roll call against the document's own member
     * list, about one person, and the status of each side follows from the code:
     * there are two statuses, and the two sides disagree.
     */
    LIST_DROPS_PRESENT: Record<string, never>;
    LIST_ADDS_ABSENT: Record<string, never>;
    /**
     * The page's member list leaves out `voters` members the page names with a
     * vote and its roll call has present, so the subject replays as a page with no
     * list. `listed` is what the list names; `expected` is what the replay has present.
     */
    LIST_CUT: { listed: number; expected: number; voters: number };
    /** The reader's warning of the same name: the page's closing block runs past the pages it read. */
    CLOSING_BLOCK_CUT: Record<string, never>;
    /** The reader's warning of the same name: the closing pages could not be read. */
    CLOSING_READ_FAILED: Record<string, never>;
    /** One page lists the person under ΠΑΡΟΝΤΕΣ and under ΑΠΟΝΤΕΣ; the roll call keeps them absent, as the task did. */
    PERSON_IN_BOTH_LISTS: Record<string, never>;
    /** A session change fewer than half of the meeting's pages state, in a body whose pages repeat the session. */
    CHANGE_NOT_CORROBORATED: { stated: number; total: number };
    /** A page of an `opening` body lists under ΠΑΡΟΝΤΕΣ a member it says arrived later (Athens 7η jan22_2026). */
    LATE_ARRIVAL_IN_OPENING_LIST: Record<string, never>;
    /** A page names voters unlike its body: FOR where only dissenters are named, anyone where nobody is, nobody FOR where everyone is, nobody at all on a split vote where everyone is on a split vote. */
    NAMED_VOTERS_UNEXPECTED: { expected: NamedVoters };
    /** Two entries of one list on this page matched to the same person; one match is wrong. */
    NAMES_SHARE_ID: { names: string };
    /** One printed name matched to different people on different pages of the meeting. */
    NAME_MATCHED_TWICE: { name: string };
    /** A change stated during the out-of-agenda items, in a meeting with none, placed before the first subject. */
    OUT_OF_AGENDA_PLACED_FIRST: { kind: AttendanceEventKind };
    /** A page names a vote for a member the derivation has absent on that subject (`personId` names them). */
    VOTE_BY_ABSENT_MEMBER: { vote: VoteType };
    /** A page that states ΑΠΟΦΑΣΙΖΕΙ, read whole, with no vote phrase, no named voter and no count. */
    NO_VOTE_RESULT: Record<string, never>;
    /** A sheet or transcript statement about a vote that names no item of the meeting, or an item the meeting does not have. */
    UNPLACEABLE_VOTE: Record<string, never>;
    /** A party answered for its members, and the party or its members present could not be resolved. */
    PARTY_VOTE_UNRESOLVED: { vote: VoteType };
}

interface IssueFields {
    subjectId?: string;
    personId?: string;
    decisionId?: string;
    source: DataSource | null;
    rawText?: string;
    /** Where the reported statement can be checked. */
    evidence?: Evidence;
}

/**
 * A code bound to its own parameters: the sentence is rendered at the edges,
 * from the catalog.
 *
 * It carries no severity. How bad a code is belongs to the code, not to the row
 * that raises it, so it is stated once in `ISSUE_SEVERITY` (./issueCatalogue.ts)
 * and every reader looks it up from `code`. A raise site therefore cannot state
 * a severity that disagrees with what the app shows, because there is no field
 * to state one in.
 */
export type Issue = { [C in IssueCode]: IssueFields & { code: C; params: IssueParams[C] } }[IssueCode];

export type AttendanceOrigin = 'stated' | 'derived';
export type VoteOrigin = 'stated' | 'inferred';

/** Rows carry the source whose statement decided them, so a reader can say where a fact came from. */
export interface DerivedAttendanceRow { subjectId: string; personId: string; status: AttendanceStatus; origin: AttendanceOrigin; source: DataSource }
export interface DerivedVoteRow { subjectId: string; personId: string; voteType: VoteType; origin: VoteOrigin; source: DataSource }

export interface DerivationOutput {
    attendance: DerivedAttendanceRow[];
    votes: DerivedVoteRow[];
    issues: Issue[];
    /** The opening roll call the derived sources state together, one row per person, ranked by SOURCE_PRECEDENCE; written as output and never read back. */
    rollCall: RollCallRow[];
    /** The session's changes the derived sources state together, ranked per person; written as output and never read back. */
    events: EventRow[];
}

/**
 * Source precedence when two sources state different values for one fact: a
 * person's entry outranks the decision documents, the documents outrank the
 * sheet the back office kept, and the sheet outranks the transcript. The
 * documents stay the reference until the other two are measured (issue #807).
 * The loser of every disagreement is reported as SOURCES_DISAGREE.
 *
 * Nothing writes a `manual` row yet. The derivation writes one row per person
 * and subject for the derived sources, so the readers see no duplicate; a
 * manual row would still render beside it until a manual-entry UI ships.
 */
export const SOURCE_PRECEDENCE: DataSource[] = ['manual', 'decision', 'sheet', 'transcript'];

/**
 * The sources whose rows in the four fact tables are derivation output: the
 * write replaces them all at once, and the derivation never reads them back.
 * Every other source's rows are stated facts.
 */
export const DERIVED_SOURCES: DataSource[] = ['decision', 'sheet', 'transcript'];

/** Lower wins. A source outside the list ranks last, so an unknown one never displaces a known one. */
export function sourceRank(source: DataSource): number {
    const i = SOURCE_PRECEDENCE.indexOf(source);
    return i < 0 ? SOURCE_PRECEDENCE.length : i;
}
