import { ISSUE_CODES, type IssueCode } from './types';

export type IssueSeverity = 'info' | 'warning' | 'error';

/**
 * The five steps a fact passes through, in order: what each document states,
 * where its stated changes land, who that leaves present, how the votes follow
 * from that, and the write.
 */
export const DERIVATION_STAGES = ['read', 'place', 'presence', 'votes', 'write'] as const;
export type DerivationStage = typeof DERIVATION_STAGES[number];

/**
 * Every code's severity, in one place.
 *
 * The severity a reader is shown has to be the severity the derivation
 * actually raises, and until this existed there was nowhere to read it from:
 * each raise site carried its own literal, so a glossary would have been a
 * second, unenforced copy. This is a mirror of those literals rather than
 * their source — the raise sites still spell theirs out, so that this module
 * adds nothing to the derivation's own path — and `issueCatalogue.test.ts`
 * reads the raise sites and fails if the two ever disagree.
 *
 * Pointing the raise sites at this map is the obvious follow-up; it was left
 * out deliberately, because it would rewrite files another branch is editing.
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
};

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
    UNPLACEABLE_ANCHOR: ['place'],
    IMPLIED_CHANGE: ['presence'],
    PRESENCE_UNKNOWN: ['presence'],
    NO_ROLL_CALL: ['presence', 'write'],
    SOURCES_DISAGREE: ['presence', 'votes'],
    TALLY_MISMATCH: ['votes'],
    NO_STORED_FACTS: ['write'],
};

/** The codes a step can raise, in the order `ISSUE_CODES` declares them. */
export function codesForStage(stage: DerivationStage): IssueCode[] {
    return ISSUE_CODES.filter(code => ISSUE_STAGES[code].includes(stage));
}
