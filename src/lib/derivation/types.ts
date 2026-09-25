import type {
    AdministrativeBodyType, AttendanceAnchorKind, AttendanceEventKind, AttendancePhase, AttendanceStatus,
    AttendanceTiming, DataSource, NonAgendaReason, VoteType,
} from '@prisma/client';
import type { DecisionConventions, RollCallLayout } from '@/lib/decisionConventions';

/** A subject in the transcript-derived order, withdrawn ones excluded. */
export interface OrderedSubject {
    id: string;
    name: string;
    agendaItemIndex: number | null;
    nonAgendaReason: NonAgendaReason | null;
    decisionNumber: string | null;
}

export interface RollCallRow { personId: string; status: AttendanceStatus; source: DataSource }

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
}

/** A change one page states, before the session resolves it (spec §4.1.2). */
export type StatedChange = Omit<EventRow, 'id' | 'reportingDocuments' | 'totalDocuments' | 'source'>;

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
    /** Always null today: no source states a per-decision absent list. The clerk's sheet will (§6). */
    absentIds: string[] | null;
    /** The names each list prints on this page, as printed: the roll call's two lists and ΤΑ ΜΕΛΗ after the decision. */
    lists: { rollCallPresent: string[]; rollCallAbsent: string[]; decisionPresent: string[] };
    /** The changes this page states about a person on the roster; empty for a reading that states no facts. */
    statedChanges: StatedChange[];
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
}

export interface DerivationInput {
    cityId: string;
    meetingId: string;
    subjects: OrderedSubject[];
    rollCall: RollCallRow[];
    events: EventRow[];
    documents: DocumentFacts[];
    /** Subjects holding decision-sourced vote rows now: what a write replaces and, for an unread document, cannot rebuild. */
    subjectIdsWithStoredVotes: string[];
    conventions: DecisionConventions | null;
    mayorPersonId: string | null;
    /** The head of the meeting's body on its date. */
    presidentPersonId: string | null;
    /** The body's secretary on its date, when `listOmitsSecretary` is set; null otherwise. */
    secretaryPersonId: string | null;
    /** The body's type: the mayor sits only on a committee (spec §6.1). */
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
    'PERSON_IN_BOTH_LISTS', 'CHANGE_NOT_CORROBORATED',
] as const;
export type IssueCode = typeof ISSUE_CODES[number];

/** One vote type the printed count and the derived rows disagree about. */
export interface TallyDiff { type: VoteType; printed: number; derived: number }

/** Which disagreement SOURCES_DISAGREE reports; its message selects on `kind`. */
export type SourcesDisagreeParams =
    | { kind: 'rollCall'; winSource: DataSource; winStatus: AttendanceStatus; loseSource: DataSource; loseStatus: AttendanceStatus }
    | { kind: 'event'; winKind: AttendanceEventKind; winRawText: string; winSource: DataSource; loseRawText: string; loseSource: DataSource }
    | { kind: 'statedList'; status: AttendanceStatus; eventKind: AttendanceEventKind; rawText: string }
    | { kind: 'doubleVote'; firstVote: VoteType; secondVote: VoteType };

/**
 * What each code's message interpolates. A code raised in more than one
 * situation carries the discriminator its message selects on (`reason`, `kind`),
 * so the situations stay distinct without the code losing its single entry.
 */
export interface IssueParams {
    NO_ROLL_CALL: Record<string, never>;
    PRESENCE_UNKNOWN: { reason: 'unsettled' | 'assumedOpening' | 'noPerDecisionList' };
    CONVENTIONS_UNCONFIRMED: Record<string, never>;
    UNMATCHED_NAME: { name: string };
    UNPLACEABLE_ANCHOR: {
        kind: AttendanceEventKind;
        reason: 'noAgendaItem' | 'noSuchAgendaItem' | 'noSuchSubject' | 'decisionNumberNoDigits' | 'noDecisionNumbers' | 'decisionNumberBeyond' | 'noOutOfAgenda';
        /** The anchor the reason names — «#3», «OA1», a subject id, a decision number — empty when it names none. */
        detail: string;
    };
    IMPLIED_CHANGE: { status: AttendanceStatus };
    TALLY_MISMATCH: { diffs: TallyDiff[] };
    INCOMPLETE_READ: Record<string, never>;
    PRESIDING_DISAGREES: { names: string };
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
    /** One page lists the person under ΠΑΡΟΝΤΕΣ and under ΑΠΟΝΤΕΣ; the roll call keeps them absent, as the task did. */
    PERSON_IN_BOTH_LISTS: Record<string, never>;
    /** A session change fewer than half of the meeting's pages state, in a body whose pages repeat the session. */
    CHANGE_NOT_CORROBORATED: { stated: number; total: number };
}

interface IssueFields {
    subjectId?: string;
    personId?: string;
    decisionId?: string;
    source: DataSource | null;
    rawText?: string;
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

export interface DerivedAttendanceRow { subjectId: string; personId: string; status: AttendanceStatus; origin: AttendanceOrigin }
export interface DerivedVoteRow { subjectId: string; personId: string; voteType: VoteType; origin: VoteOrigin }

export interface DerivationOutput {
    attendance: DerivedAttendanceRow[];
    votes: DerivedVoteRow[];
    issues: Issue[];
    /** Subjects whose vote is printed from the phrase alone (no attendance known). */
    phraseOnlySubjectIds: string[];
}

/**
 * Source precedence when two sources state different values for one fact.
 *
 * A placeholder until the other sources land: nothing writes a `manual` row yet,
 * and the readers (`getExtractedDataForMeeting`, `getMeetingAttendance`) select
 * every source, so the first manual row written would render beside the decision
 * row rather than instead of it. The filter belongs there before any manual-entry
 * UI ships.
 */
export const SOURCE_PRECEDENCE: DataSource[] = ['manual', 'decision', 'transcript'];

/** Lower wins. A source outside the list ranks last, so an unknown one never displaces a known one. */
export function sourceRank(source: DataSource): number {
    const i = SOURCE_PRECEDENCE.indexOf(source);
    return i < 0 ? SOURCE_PRECEDENCE.length : i;
}
