import { AttendanceStatus, VoteType } from '@prisma/client';

export interface VoteResultSummary {
    forCount: number;
    againstCount: number;
    abstainCount: number;
    /** Members who declared ΠΑΡΩΝ — present but not participating (not counted in totalVotes) */
    presentCount: number;
    /** Members who declared ΑΠΟΧΗ — declined to participate (not counted in totalVotes) */
    didNotVoteCount: number;
    totalVotes: number;
    isUnanimous: boolean;
    passed: boolean;
}

/** The counts the outcome sentence needs — the subset of {@link VoteResultSummary} it reads. */
export type VoteOutcomeCounts = Pick<VoteResultSummary, 'forCount' | 'againstCount' | 'abstainCount' | 'passed' | 'isUnanimous'>;

/** A `next-intl` translator, typed structurally so no namespace pins these
 * helpers to one surface. */
type VoteTranslator = (key: string, values?: Record<string, string | number>) => string;

/**
 * The counts alone: "6 for", "8 for, 1 against", with the abstentions appended.
 *
 * {@link voteResultSentence} bundles the outcome word and the counts into one
 * translated string. A surface that already prints the word — the Αποτέλεσμα
 * column of the Πίνακας αποφάσεων — cannot take the counts out of that sentence
 * without printing the word twice.
 *
 * A zero stays out: "6 for, 0 against" says nothing "6 for" does not.
 */
export function voteCountsPhrase(t: VoteTranslator, outcome: VoteOutcomeCounts): string {
    const parts = [`${outcome.forCount} ${t('voteFor')}`];
    if (outcome.againstCount > 0) parts.push(`${outcome.againstCount} ${t('voteAgainst')}`);
    if (outcome.abstainCount > 0) parts.push(`${outcome.abstainCount} ${t('voteAbstain')}`);
    return parts.join(', ');
}

/**
 * The one-line vote outcome sentence: "Unanimous (24 for)", "By majority (14
 * for, 10 against)", or "Rejected (...)", with the abstentions appended.
 *
 * The public subject page and the decisions page both print it. The translator
 * is typed structurally rather than against one namespace, so neither surface's
 * message keys can pin the helper to itself.
 */
export function voteResultSentence(
    t: VoteTranslator,
    outcome: VoteOutcomeCounts,
): string {
    const main = outcome.isUnanimous
        ? t('unanimous', { count: outcome.forCount })
        : outcome.passed
            ? t('majorityVote', { for: outcome.forCount, against: outcome.againstCount })
            : t('rejected', { against: outcome.againstCount, for: outcome.forCount });
    const abstain = !outcome.isUnanimous && outcome.abstainCount > 0
        ? `, ${outcome.abstainCount} ${t('voteAbstain')}`
        : '';
    return main + abstain;
}

export function calculateVoteResult(votes: { voteType: VoteType }[]): VoteResultSummary {
    let forCount = 0;
    let againstCount = 0;
    let abstainCount = 0;
    let presentCount = 0;
    let didNotVoteCount = 0;

    for (const vote of votes) {
        switch (vote.voteType) {
            case 'FOR':
                forCount++;
                break;
            case 'AGAINST':
                againstCount++;
                break;
            case 'ABSTAIN':
                abstainCount++;
                break;
            case 'PRESENT':
                presentCount++;
                break;
            case 'DID_NOT_VOTE':
                didNotVoteCount++;
                break;
        }
    }

    // PRESENT and DID_NOT_VOTE are declarations, not votes — excluded from totalVotes
    const totalVotes = forCount + againstCount + abstainCount;
    const passed = forCount > againstCount;
    const isUnanimous = totalVotes > 0 && againstCount === 0 && abstainCount === 0;

    return { forCount, againstCount, abstainCount, presentCount, didNotVoteCount, totalVotes, isUnanimous, passed };
}

/**
 * Get person IDs of members who were absent during a vote.
 * Absent = marked ABSENT in attendance AND didn't cast a vote AND not the mayor.
 * The mayor is excluded because they're displayed separately in the composition.
 */
export function getAbsentNonVoterIds(
    attendance: Array<{ personId: string; status: AttendanceStatus }>,
    voterIds: Set<string>,
    mayorPersonId: string | null,
): Set<string> {
    const result = new Set<string>();
    for (const a of attendance) {
        if (a.status === 'ABSENT' && !voterIds.has(a.personId) && a.personId !== mayorPersonId) {
            result.add(a.personId);
        }
    }
    return result;
}
