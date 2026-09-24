import { VoteType } from '@prisma/client';
import { calculateVoteResult, voteCountsPhrase, voteResultSentence, type VoteOutcomeCounts } from '@/lib/utils/votes';

function makeVotes(...types: VoteType[]) {
    return types.map(voteType => ({ voteType }));
}

describe('calculateVoteResult', () => {
    it('returns zeros for empty votes', () => {
        const result = calculateVoteResult([]);
        expect(result).toEqual({
            forCount: 0,
            againstCount: 0,
            abstainCount: 0,
            presentCount: 0,
            didNotVoteCount: 0,
            totalVotes: 0,
            isUnanimous: false,
            passed: false,
        });
    });

    it('detects unanimous vote (all FOR)', () => {
        const result = calculateVoteResult(makeVotes('FOR', 'FOR', 'FOR'));
        expect(result.forCount).toBe(3);
        expect(result.againstCount).toBe(0);
        expect(result.abstainCount).toBe(0);
        expect(result.totalVotes).toBe(3);
        expect(result.isUnanimous).toBe(true);
        expect(result.passed).toBe(true);
    });

    it('detects majority vote (more FOR than AGAINST)', () => {
        const result = calculateVoteResult(makeVotes('FOR', 'FOR', 'FOR', 'AGAINST', 'AGAINST'));
        expect(result.forCount).toBe(3);
        expect(result.againstCount).toBe(2);
        expect(result.totalVotes).toBe(5);
        expect(result.isUnanimous).toBe(false);
        expect(result.passed).toBe(true);
    });

    it('detects rejected vote (more AGAINST than FOR)', () => {
        const result = calculateVoteResult(makeVotes('FOR', 'AGAINST', 'AGAINST', 'AGAINST'));
        expect(result.forCount).toBe(1);
        expect(result.againstCount).toBe(3);
        expect(result.totalVotes).toBe(4);
        expect(result.isUnanimous).toBe(false);
        expect(result.passed).toBe(false);
    });

    it('detects rejected vote with zero FOR', () => {
        const result = calculateVoteResult(makeVotes('AGAINST', 'AGAINST', 'AGAINST'));
        expect(result.forCount).toBe(0);
        expect(result.againstCount).toBe(3);
        expect(result.isUnanimous).toBe(false);
        expect(result.passed).toBe(false);
    });

    it('counts abstain votes separately', () => {
        const result = calculateVoteResult(makeVotes('FOR', 'FOR', 'ABSTAIN', 'AGAINST'));
        expect(result.forCount).toBe(2);
        expect(result.againstCount).toBe(1);
        expect(result.abstainCount).toBe(1);
        expect(result.totalVotes).toBe(4);
        expect(result.isUnanimous).toBe(false);
        expect(result.passed).toBe(true);
    });

    it('is not unanimous when abstains are present', () => {
        const result = calculateVoteResult(makeVotes('FOR', 'FOR', 'ABSTAIN'));
        expect(result.isUnanimous).toBe(false);
        expect(result.passed).toBe(true);
    });

    it('tie vote does not pass', () => {
        const result = calculateVoteResult(makeVotes('FOR', 'AGAINST'));
        expect(result.forCount).toBe(1);
        expect(result.againstCount).toBe(1);
        expect(result.passed).toBe(false);
    });

    it('single FOR vote is unanimous and passed', () => {
        const result = calculateVoteResult(makeVotes('FOR'));
        expect(result.forCount).toBe(1);
        expect(result.totalVotes).toBe(1);
        expect(result.isUnanimous).toBe(true);
        expect(result.passed).toBe(true);
    });

    it('single AGAINST vote does not pass and is not unanimous', () => {
        const result = calculateVoteResult(makeVotes('AGAINST'));
        expect(result.passed).toBe(false);
        expect(result.isUnanimous).toBe(false);
    });

    it('all ABSTAIN does not pass and is not unanimous', () => {
        const result = calculateVoteResult(makeVotes('ABSTAIN', 'ABSTAIN'));
        expect(result.passed).toBe(false);
        expect(result.isUnanimous).toBe(false);
        expect(result.abstainCount).toBe(2);
        expect(result.totalVotes).toBe(2);
    });
});

describe('voteResultSentence', () => {
    // Returns the key and its params, so each assertion names the message the
    // sentence chose without depending on message-file contents. No cast: the
    // helper takes a plain translator function, not one namespace's translator.
    const t = (key: string, params?: Record<string, string | number>) =>
        params ? `${key}${JSON.stringify(params)}` : key;

    const neutral: VoteOutcomeCounts = { forCount: 0, againstCount: 0, abstainCount: 0, passed: true, isUnanimous: true };

    it('is the unanimous sentence when isUnanimous', () => {
        expect(voteResultSentence(t, { ...neutral, forCount: 5 })).toBe('unanimous{"count":5}');
    });

    it('is the majority sentence when passed and not unanimous', () => {
        expect(voteResultSentence(t, { ...neutral, isUnanimous: false, forCount: 3, againstCount: 1 }))
            .toBe('majorityVote{"for":3,"against":1}');
    });

    it('is the rejected sentence when not passed', () => {
        expect(voteResultSentence(t, { ...neutral, isUnanimous: false, passed: false, forCount: 1, againstCount: 3 }))
            .toBe('rejected{"against":3,"for":1}');
    });

    it('appends the abstain count when not unanimous and there are abstainers', () => {
        expect(voteResultSentence(t, { ...neutral, isUnanimous: false, forCount: 2, abstainCount: 2 }))
            .toBe('majorityVote{"for":2,"against":0}, 2 voteAbstain');
    });

    it('omits the abstain tail when the vote was unanimous', () => {
        expect(voteResultSentence(t, { ...neutral, forCount: 5, abstainCount: 3 })).toBe('unanimous{"count":5}');
    });
});

describe('voteCountsPhrase', () => {
    const t = (key: string) => key;
    const neutral: VoteOutcomeCounts = { forCount: 0, againstCount: 0, abstainCount: 0, passed: true, isUnanimous: true };

    it('is the for count alone when nobody voted against or abstained', () => {
        expect(voteCountsPhrase(t, { ...neutral, forCount: 6 })).toBe('6 voteFor');
    });

    it('names the against count beside it', () => {
        expect(voteCountsPhrase(t, { ...neutral, isUnanimous: false, forCount: 8, againstCount: 1 }))
            .toBe('8 voteFor, 1 voteAgainst');
    });

    it('names the abstentions, unanimous or not', () => {
        expect(voteCountsPhrase(t, { ...neutral, forCount: 5, abstainCount: 3 })).toBe('5 voteFor, 3 voteAbstain');
    });
});
