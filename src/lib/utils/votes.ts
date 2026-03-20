import { VoteType } from '@prisma/client';

export interface VoteResultSummary {
    forCount: number;
    againstCount: number;
    abstainCount: number;
    totalVotes: number;
    isUnanimous: boolean;
    passed: boolean;
}

export function calculateVoteResult(votes: { voteType: VoteType }[]): VoteResultSummary {
    let forCount = 0;
    let againstCount = 0;
    let abstainCount = 0;

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
        }
    }

    const totalVotes = forCount + againstCount + abstainCount;
    const passed = forCount > againstCount;
    const isUnanimous = totalVotes > 0 && againstCount === 0 && abstainCount === 0;

    return { forCount, againstCount, abstainCount, totalVotes, isUnanimous, passed };
}
