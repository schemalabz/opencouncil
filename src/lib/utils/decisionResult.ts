import type { VoteType } from '@prisma/client';
import { calculateVoteResult } from '@/lib/utils/votes';

/** What the Αποτέλεσμα column says about one row. */
export type ResultKey = 'withdrawn' | 'unanimous' | 'majority' | 'rejected' | 'none' | 'noVote';

export interface ResultInput {
    withdrawn: boolean;
    hasDecision: boolean;
    votes: ReadonlyArray<{ voteType: VoteType }>;
}

/**
 * The one word a posted Πίνακας αποφάσεων puts beside an item.
 *
 * The counts stay out of the word: a clerk reading down the column wants
 * "Ομόφωνα", and the numbers come back beside it when the row is hovered.
 * `none` and `noVote` both render as a dash but are different facts — nothing
 * is linked yet, versus a decision whose document records no vote — and only
 * the second one explains itself.
 */
export function resultKey(input: ResultInput): ResultKey {
    if (input.withdrawn) return 'withdrawn';
    if (!input.hasDecision) return 'none';
    const result = calculateVoteResult(input.votes.map(v => ({ voteType: v.voteType })));
    if (result.totalVotes === 0) return 'noVote';
    if (result.isUnanimous) return 'unanimous';
    return result.passed ? 'majority' : 'rejected';
}

/**
 * Whether a recorded vote stands behind the word — the rows that have counts
 * to reveal. The other three results show a dash or a withdrawal, and
 * {@link voteCountsPhrase} would print "0 υπέρ" for them.
 */
export function hasRecordedVote(result: ResultKey): boolean {
    return result === 'unanimous' || result === 'majority' || result === 'rejected';
}
