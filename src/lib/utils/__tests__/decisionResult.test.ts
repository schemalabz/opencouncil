import { resultKey } from '../decisionResult';
import type { VoteType } from '@prisma/client';

const votes = (...types: VoteType[]) => types.map(voteType => ({ voteType }));

describe('resultKey', () => {
    it('calls a withdrawn subject withdrawn, whatever else it carries', () => {
        expect(resultKey({ withdrawn: true, hasDecision: true, votes: votes('FOR', 'FOR') })).toBe('withdrawn');
    });

    // A transcript stating a majority and naming one opponent the reader could
    // not match: inference is refused, the rows hold the dissent alone, and the
    // count alone would call the approval a rejection.
    it('takes the statement\'s word when the rows hold no supporter', () => {
        expect(resultKey({ withdrawn: false, hasDecision: false, votes: votes('AGAINST'), statedOutcome: 'majority' })).toBe('majority');
        expect(resultKey({ withdrawn: false, hasDecision: false, votes: [], statedOutcome: 'unanimous' })).toBe('unanimous');
        // Rows with a supporter are the vote, whatever the word.
        expect(resultKey({ withdrawn: false, hasDecision: true, votes: votes('FOR', 'FOR', 'AGAINST'), statedOutcome: 'unanimous' })).toBe('majority');
    });

    it('says nothing when no decision is linked and nothing states a vote', () => {
        expect(resultKey({ withdrawn: false, hasDecision: false, votes: [] })).toBe('none');
    });

    it('reads a vote another source states before any decision is linked', () => {
        expect(resultKey({ withdrawn: false, hasDecision: false, votes: votes('FOR', 'FOR', 'AGAINST') })).toBe('majority');
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
