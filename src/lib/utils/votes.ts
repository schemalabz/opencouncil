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
