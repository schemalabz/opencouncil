import { ISSUE_CODES, type Issue, type IssueCode } from './types';

export type IssueSeverity = 'info' | 'warning' | 'error';

/**
 * The six steps a fact passes through, in order: what each document states,
 * what the pages state together, where the stated changes land, who that
 * leaves present, how the votes follow from that, and the write.
 */
export const DERIVATION_STAGES = ['read', 'resolve', 'place', 'presence', 'votes', 'write'] as const;
export type DerivationStage = typeof DERIVATION_STAGES[number];

/**
 * Every code's severity, in one place — and the only place.
 *
 * The severity a reader is shown has to be the severity the derivation actually
 * raises. Each raise site used to spell out its own literal, which made this map
 * a second copy free to drift, and one site computed its literal from the row
 * («info» for a member the list drops) while both audit surfaces printed the
 * map's «warning» over it. An `Issue` therefore carries no severity at all:
 * severity is a function of the code, this map is the function, and a raise site
 * has nowhere to state a different one.
 *
 * A code needing two severities is two codes — see `LIST_DROPS_PRESENT` and
 * `LIST_ADDS_ABSENT`, which were one code until this map became the source.
 */
export const ISSUE_SEVERITY: Record<IssueCode, IssueSeverity> = {
    NO_ROLL_CALL: 'error',
    PRESENCE_UNKNOWN: 'warning',
    CONVENTIONS_UNCONFIRMED: 'info',
    UNMATCHED_NAME: 'warning',
    UNPLACEABLE_ANCHOR: 'warning',
    IMPLIED_CHANGE: 'info',
    TALLY_MISMATCH: 'warning',
    INCOMPLETE_READ: 'error',
    PRESIDING_DISAGREES: 'warning',
    SOURCES_DISAGREE: 'warning',
    NO_STORED_FACTS: 'error',
    LAYOUT_DISAGREES: 'warning',
    ITEM_NUMBER_DISAGREES: 'error',
    UNREAD_DOCUMENT: 'warning',
    LIST_DROPS_PRESENT: 'info',
    LIST_ADDS_ABSENT: 'warning',
    PERSON_IN_BOTH_LISTS: 'info',
    CHANGE_NOT_CORROBORATED: 'info',
    LATE_ARRIVAL_IN_OPENING_LIST: 'warning',
    NAMED_VOTERS_UNEXPECTED: 'warning',
    NAMES_SHARE_ID: 'warning',
    NAME_MATCHED_TWICE: 'warning',
    OUT_OF_AGENDA_PLACED_FIRST: 'info',
};

/** Worse first. Private: what callers need is "which of these is worse", below. */
const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Which of two codes is worse, as a sort comparator: worse first.
 *
 * The shared concern is the order, not the numbers. Both audit surfaces kept
 * their own copy of the same three-value map to answer it — and a third copy
 * decided the colours — so the module that owns the vocabulary answers it
 * instead, from each code's one stated severity.
 */
export function compareCodeSeverity(a: IssueCode, b: IssueCode): number {
    return SEVERITY_ORDER[ISSUE_SEVERITY[a]] - SEVERITY_ORDER[ISSUE_SEVERITY[b]];
}

/** The worst issue of a set, or undefined for an empty one; ties keep the first. */
export function worstIssue(issues: readonly Issue[]): Issue | undefined {
    return [...issues].sort((a, b) => compareCodeSeverity(a.code, b.code))[0];
}

/**
 * Which step raises each code.
 *
 * Two codes are raised at more than one step, and the plural is the point:
 * `NO_ROLL_CALL` is both a presence replay that cannot start and a write that
 * refuses to run, and `SOURCES_DISAGREE` is raised separately about presence
 * and about votes. A reader told a single step for either would be told
 * something untrue, so the catalogue names every step a code can come from.
 */
export const ISSUE_STAGES: Record<IssueCode, readonly DerivationStage[]> = {
    CONVENTIONS_UNCONFIRMED: ['read'],
    INCOMPLETE_READ: ['read'],
    ITEM_NUMBER_DISAGREES: ['read'],
    LAYOUT_DISAGREES: ['read'],
    PRESIDING_DISAGREES: ['read'],
    UNMATCHED_NAME: ['read'],
    UNREAD_DOCUMENT: ['read'],
    PERSON_IN_BOTH_LISTS: ['resolve'],
    CHANGE_NOT_CORROBORATED: ['resolve'],
    LATE_ARRIVAL_IN_OPENING_LIST: ['resolve'],
    NAMED_VOTERS_UNEXPECTED: ['read'],
    NAMES_SHARE_ID: ['resolve'],
    NAME_MATCHED_TWICE: ['resolve'],
    UNPLACEABLE_ANCHOR: ['resolve', 'place'],
    OUT_OF_AGENDA_PLACED_FIRST: ['place'],
    IMPLIED_CHANGE: ['presence'],
    PRESENCE_UNKNOWN: ['presence'],
    NO_ROLL_CALL: ['presence', 'write'],
    SOURCES_DISAGREE: ['presence', 'votes'],
    LIST_DROPS_PRESENT: ['presence'],
    LIST_ADDS_ABSENT: ['presence'],
    TALLY_MISMATCH: ['votes'],
    NO_STORED_FACTS: ['write'],
};

/** The codes a step can raise, in the order `ISSUE_CODES` declares them. */
export function codesForStage(stage: DerivationStage): IssueCode[] {
    return ISSUE_CODES.filter(code => ISSUE_STAGES[code].includes(stage));
}
