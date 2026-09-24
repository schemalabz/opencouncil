import { resultKey } from '@/lib/utils/decisionResult';
import type { VoteType } from '@prisma/client';

const votes = (...types: VoteType[]) => types.map(voteType => ({ voteType }));

describe('resultKey', () => {
    it('calls a withdrawn subject withdrawn, whatever else it carries', () => {
        expect(resultKey({ withdrawn: true, hasDecision: true, votes: votes('FOR', 'FOR') })).toBe('withdrawn');
    });

    it('says nothing when no decision is linked', () => {
        expect(resultKey({ withdrawn: false, hasDecision: false, votes: [] })).toBe('none');
    });

    it('separates a linked decision with no recorded vote from a missing one', () => {
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: [] })).toBe('noVote');
    });

    it('reads a vote with no votes against and no abstentions as unanimous', () => {
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: votes('FOR', 'FOR', 'FOR') })).toBe('unanimous');
    });

    it('reads a vote carried with opposition as a majority', () => {
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: votes('FOR', 'FOR', 'AGAINST') })).toBe('majority');
    });

    it('counts an abstention as opposition to unanimity, not to the outcome', () => {
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: votes('FOR', 'FOR', 'ABSTAIN') })).toBe('majority');
    });

    it('reads a vote lost as rejected', () => {
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: votes('FOR', 'AGAINST', 'AGAINST') })).toBe('rejected');
    });

    it('does not count a declaration as a vote', () => {
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: votes('PRESENT', 'DID_NOT_VOTE') })).toBe('noVote');
    });
});
