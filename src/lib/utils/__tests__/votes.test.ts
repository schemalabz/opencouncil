import { VoteType } from '@prisma/client';
import { calculateVoteResult } from '../votes';

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
