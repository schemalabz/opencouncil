/**
 * Reading a stored extraction into facts. The stored JSON is the poll's own
 * payload, so the shapes are known — what is not known is whether the people it
 * names still exist: an id left behind by a deleted person fails the foreign key
 * inside replaceDerivedRows and aborts the whole write, which would leave the
 * meeting underivable for good.
 */
// The module reaches Prisma through readDerivationRows; the pure half under test does not.
jest.mock('@/lib/db/derivationFacts', () => ({ readDerivationRows: jest.fn(), replaceDerivedRows: jest.fn() }));

import { documentFactsFromDecision } from '../load';

const decision = (extraction: unknown) => ({
    id: 'd1', subjectId: 's1', voteResultPhrase: 'Κατά πλειοψηφία', unmatchedNames: ['Άγνωστος Α.'],
    incomplete: false, mayorPresent: null, declaredItemNumber: null, declaredOutOfAgenda: null, extraction,
});

const roster = new Set(['p1', 'p2']);

describe('documentFactsFromDecision', () => {
    it('keeps the named votes and the stated present list of people in the roster', () => {
        const facts = documentFactsFromDecision(decision({
            voteDetails: [{ personId: 'p1', vote: 'AGAINST' }],
            decisionAttendance: { presentIds: ['p1', 'p2'] },
        }), roster);
        expect(facts.namedVotes).toEqual([{ personId: 'p1', vote: 'AGAINST' }]);
        expect(facts.presentIds).toEqual(['p1', 'p2']);
        expect(facts.unmatchedNames).toEqual(['Άγνωστος Α.']);
        expect(facts.hasExtraction).toBe(true);
    });

    it('drops an id the roster no longer holds and counts it as unmatched', () => {
        const facts = documentFactsFromDecision(decision({
            voteDetails: [{ personId: 'p1', vote: 'FOR' }, { personId: 'deleted', vote: 'AGAINST' }],
            decisionAttendance: { presentIds: ['p2', 'gone'] },
        }), roster);
        expect(facts.namedVotes).toEqual([{ personId: 'p1', vote: 'FOR' }]);
        expect(facts.presentIds).toEqual(['p2']);
        expect(facts.unmatchedNames).toEqual(['Άγνωστος Α.', 'deleted', 'gone']);
    });

    it('drops a vote value that is not a VoteType', () => {
        const facts = documentFactsFromDecision(decision({ voteDetails: [{ personId: 'p1', vote: 'MAYBE' }] }), roster);
        expect(facts.namedVotes).toEqual([]);
    });

    it('a list whose every id is stale is no stated list, not an empty one', () => {
        // presentIds: [] would read as "the document says nobody was present".
        const facts = documentFactsFromDecision(decision({ decisionAttendance: { presentIds: ['gone'] } }), roster);
        expect(facts.presentIds).toBeNull();
    });

    it('keeps a roll-call layout the conventions vocabulary knows and drops one it does not', () => {
        expect(documentFactsFromDecision(decision({ rollCall: { layout: 'composition_and_absent' } }), roster).rollCallLayout).toBe('composition_and_absent');
        expect(documentFactsFromDecision(decision({ rollCall: { layout: 'whatever' } }), roster).rollCallLayout).toBeNull();
        expect(documentFactsFromDecision(decision({}), roster).rollCallLayout).toBeNull();
    });

    it('a decision read before facts were stored has no extraction', () => {
        const facts = documentFactsFromDecision(decision(null), roster);
        expect(facts.hasExtraction).toBe(false);
        expect(facts.namedVotes).toEqual([]);
        expect(facts.presentIds).toBeNull();
    });
});
