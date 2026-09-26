import { deriveVotes, phraseOutcome, phrasePermitsInference } from '../deriveVotes';
import type { DocumentFacts } from '../types';
const doc = (o: Partial<DocumentFacts> = {}): DocumentFacts => ({ subjectId: 's', decisionId: 'd', voteResultPhrase: 'Ομόφωνα', namedVotes: [], tally: null,
    presentIds: null, absentIds: null, rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], perVoteAbsences: [], nameMatches: null, unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null, mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null, hasExtraction: true, ...o });

describe('phrasePermitsInference', () => {
    it.each([['Ομόφωνα', true], ['ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ', true], ['Κατά πλειοψηφία', true], ['Με δεκαέξι (16) θετικές ψήφους', true], ['ΑΝΑΒΑΛΛΕΙ', false], [null, false],
        // a digit loose in the sentence is not a vote count: the parser binds it to the count word
        ['ΑΝΑΒΑΛΛΕΙ τη συζήτηση του 3ου θέματος υπέρ της επιτροπής', false],
        ['ΓΝΩΜΟΔΟΤΕΙ θετικά επί του υπ. αριθμ. 12 αιτήματος', false],
    ])('%s → %s', (p, want) => {
        expect(phrasePermitsInference(p)).toBe(want);
    });
});
describe('phraseOutcome', () => {
    it.each([['Ομόφωνα', 'unanimous'], ['ΟΜΟΦΩΝΑ', 'unanimous'], ['ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΩΣ', 'unanimous'], ['ομοφώνως', 'unanimous'],
        ['Κατά πλειοψηφία', 'majority'], ['ΑΝΑΒΑΛΛΕΙ', null], [null, null],
        // Vrilissia's wording for a vote nobody opposed and somebody sat out as ΠΑΡΩΝ: neither word applies, so the page uses neither.
        ['Με πέντε (5) θετικές ψήφους', null],
        // A multi-part vote names both (Athens ΔΣ 14/01/2026, item 35): no single word is the outcome.
        ['α) ομόφωνα τα πρακτικά Νο 2 και 3 με ΥΠΕΡ 29 ψήφους· γ) κατά πλειοψηφία τα πρακτικά Νο 6 και 8 με ΥΠΕΡ 28 και ΚΑΤΑ 1 ψήφος', null],
    ])('%s → %s', (p, want) => {
        expect(phraseOutcome(p)).toBe(want);
    });
});
describe('deriveVotes', () => {
    it('unanimous: FOR inferred for every present member', () => {
        const { votes, issues } = deriveVotes(doc(), new Set(['p1', 'p2']), null);
        expect(votes).toEqual(expect.arrayContaining([{ subjectId: 's', personId: 'p1', voteType: 'FOR', origin: 'inferred' }, { subjectId: 's', personId: 'p2', voteType: 'FOR', origin: 'inferred' }]));
        expect(issues).toEqual([]);
    });
    // A page counting «ΥΠΕΡ 26 ΚΑΤΑ 6» while naming nobody: inferring would give
    // FOR to all 32 present, the six against included.
    it('a tally counting dissent it does not attribute forbids inference', () => {
        const { votes } = deriveVotes(doc({ voteResultPhrase: 'Κατά πλειοψηφία', tally: { FOR: 2, AGAINST: 1 } }), new Set(['p1', 'p2', 'p3']), null);
        expect(votes).toEqual([]);
    });
    // The same guard when the count reached us in the phrase text alone: `tally` is
    // null on every v3 reading, and the permit and the veto used to resolve the
    // tally from different places, so such a phrase permitted inference without
    // also forbidding it.
    it('a phrase counting dissent it does not name forbids inference too', () => {
        const { votes } = deriveVotes(doc({ voteResultPhrase: 'Κατά πλειοψηφία με 6 υπέρ και 26 κατά', tally: null }), new Set(['p1', 'p2', 'p3']), null);
        expect(votes.filter(v => v.origin === 'inferred')).toEqual([]);
    });
    // One dissenter listed twice must not cover a tally of two: the second is
    // still unidentified, and inferring would hand them a FOR.
    it('a dissenter named twice does not account for two counted dissents', () => {
        const { votes } = deriveVotes(doc({ voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p3', vote: 'AGAINST' }, { personId: 'p3', vote: 'AGAINST' }], tally: { FOR: 1, AGAINST: 2 } }), new Set(['p1', 'p2', 'p3']), null);
        expect(votes).toEqual([{ subjectId: 's', personId: 'p3', voteType: 'AGAINST', origin: 'stated' }]);
    });
    it('the same tally with its dissenter named infers FOR for the rest', () => {
        const { votes } = deriveVotes(doc({ voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p3', vote: 'AGAINST' }], tally: { FOR: 2, AGAINST: 1 } }), new Set(['p1', 'p2', 'p3']), null);
        expect(votes).toEqual(expect.arrayContaining([
            { subjectId: 's', personId: 'p3', voteType: 'AGAINST', origin: 'stated' },
            { subjectId: 's', personId: 'p1', voteType: 'FOR', origin: 'inferred' },
            { subjectId: 's', personId: 'p2', voteType: 'FOR', origin: 'inferred' },
        ]));
    });
    it('majority: named dissenters stated, the rest inferred FOR', () => {
        const { votes } = deriveVotes(doc({ voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p2', vote: 'AGAINST' }] }), new Set(['p1', 'p2', 'p3']), null);
        expect(votes).toEqual(expect.arrayContaining([{ subjectId: 's', personId: 'p2', voteType: 'AGAINST', origin: 'stated' }, { subjectId: 's', personId: 'p1', voteType: 'FOR', origin: 'inferred' }]));
        expect(votes.filter(v => v.voteType === 'FOR')).toHaveLength(2);
    });
    it('a page that names FOR voters gets no inference', () => {
        const { votes } = deriveVotes(doc({ voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p1', vote: 'FOR' }, { personId: 'p2', vote: 'AGAINST' }] }), new Set(['p1', 'p2', 'p3']), null);
        expect(votes).toHaveLength(2);
    });
    it('unknown presence: named rows only, no inference', () => {
        const { votes } = deriveVotes(doc({ namedVotes: [{ personId: 'p2', vote: 'ABSTAIN' }] }), null, null);
        expect(votes).toEqual([{ subjectId: 's', personId: 'p2', voteType: 'ABSTAIN', origin: 'stated' }]);
    });
    it("a mayor named FOR does not suppress the members' inference", () => {
        // The mayor is dropped from the rows, so their FOR is not the page
        // naming somebody FOR — the members are still inferred.
        const { votes } = deriveVotes(
            doc({ voteResultPhrase: 'Ομόφωνα', namedVotes: [{ personId: 'mayor', vote: 'FOR' }] }),
            new Set(['p1', 'p2', 'mayor']), 'mayor');
        expect(votes.map(v => v.personId).sort()).toEqual(['p1', 'p2']);
        expect(votes.every(v => v.voteType === 'FOR' && v.origin === 'inferred')).toBe(true);
    });
    it('the mayor never gets a vote row', () => {
        const { votes } = deriveVotes(doc(), new Set(['p1', 'mayor']), 'mayor');
        expect(votes.map(v => v.personId)).toEqual(['p1']);
    });
    it('a printed tally that disagrees is an issue; one that agrees is not', () => {
        const d = doc({ voteResultPhrase: 'Κατά πλειοψηφία με 2 υπέρ και 1 κατά', namedVotes: [{ personId: 'p3', vote: 'AGAINST' }], tally: { FOR: 2, AGAINST: 1 } });
        expect(deriveVotes(d, new Set(['p1', 'p2', 'p3']), null).issues).toEqual([]);
        // Three unnamed members present against two counted in favour: the page does
        // not say which of the three voted otherwise, so none is given a FOR.
        const bad = deriveVotes(d, new Set(['p1', 'p2', 'p3', 'p4']), null);
        expect(bad.issues).toEqual([expect.objectContaining({ code: 'TALLY_MISMATCH', subjectId: 's', decisionId: 'd' })]);
        expect(bad.issues[0].params).toEqual({ diffs: [{ type: 'FOR', printed: 2, derived: 0 }] });
    });
    it('falls back to parsing the phrase when no structured tally exists', () => {
        const d = doc({ voteResultPhrase: 'Κατά πλειοψηφία με 12 υπέρ και 3 κατά', namedVotes: [] });
        expect(deriveVotes(d, new Set(['p1']), null).issues[0]).toMatchObject({ code: 'TALLY_MISMATCH' });
    });
    it('no attendance rows: the printed tally has nothing to disagree with', () => {
        const d = doc({ voteResultPhrase: 'Ομόφωνα με 15 υπέρ', namedVotes: [] });
        expect(deriveVotes(d, null, null).issues).toEqual([]);
    });
    it('one member named twice with different votes keeps the first and reports it', () => {
        const { votes, issues } = deriveVotes(doc({ namedVotes: [{ personId: 'p1', vote: 'AGAINST' }, { personId: 'p1', vote: 'FOR' }] }), new Set(['p1']), null);
        expect(votes).toEqual([{ subjectId: 's', personId: 'p1', voteType: 'AGAINST', origin: 'stated' }]);
        expect(issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's', personId: 'p1', decisionId: 'd' })]);
    });
    it('a vote the page names for an absent member stays, and is reported once with the vote', () => {
        // Zografou dec11_2025 decision 224: Καραβίδας left during the 9th item, and the page names his vote AGAINST on item 10.
        const d = doc({ voteResultPhrase: 'Κατά πλειοψηφία', namedVotes: [{ personId: 'p2', vote: 'AGAINST' }, { personId: 'p2', vote: 'AGAINST' }, { personId: 'mayor', vote: 'FOR' }] });
        const { votes, issues } = deriveVotes(d, new Set(['p1']), 'mayor', new Set(['p2', 'mayor']));
        expect(votes).toEqual(expect.arrayContaining([{ subjectId: 's', personId: 'p2', voteType: 'AGAINST', origin: 'stated' }]));
        expect(issues).toEqual([{ code: 'VOTE_BY_ABSENT_MEMBER', subjectId: 's', personId: 'p2', decisionId: 'd', source: 'decision', params: { vote: 'AGAINST' } }]);
        // A member who is present, or whom no row covers, is not reported.
        expect(deriveVotes(d, new Set(['p1', 'p2']), 'mayor', new Set()).issues).toEqual([]);
        expect(deriveVotes(d, new Set(['p1']), 'mayor', null).issues).toEqual([]);
    });
    it('an exact duplicate named vote is dropped silently', () => {
        const { votes, issues } = deriveVotes(doc({ namedVotes: [{ personId: 'p1', vote: 'AGAINST' }, { personId: 'p1', vote: 'AGAINST' }] }), new Set(['p1']), null);
        expect(votes).toHaveLength(1);
        expect(issues).toEqual([]);
    });
});

describe('deriveVotes never infers more FOR than the page counts', () => {
    // Seven present, nobody named. Each page counts five in favour and counts the
    // other two somewhere the veto on counted dissent does not read.
    const seven = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    const inferred = (d: DocumentFacts) => deriveVotes(d, seven, null).votes.filter(v => v.origin === 'inferred');
    it('a structured tally that counts ΥΠΕΡ alone, beside a phrase that counts ΚΑΤΑ', () => {
        expect(inferred(doc({ voteResultPhrase: 'Κατά πλειοψηφία με ΥΠΕΡ 5 ΚΑΤΑ 2', tally: { FOR: 5, AGAINST: null } }))).toEqual([]);
    });
    it('a phrase that counts ΠΑΡΩΝ', () => {
        expect(inferred(doc({ voteResultPhrase: 'Κατά πλειοψηφία, ΥΠΕΡ 5, ΠΑΡΩΝ 2' }))).toEqual([]);
    });
    it('a bare count of θετικές ψήφοι (Vrilissia)', () => {
        expect(inferred(doc({ voteResultPhrase: 'Με πέντε (5) θετικές ψήφους' }))).toEqual([]);
    });
    it('the same bare count with as many present as it counts infers FOR for each', () => {
        const five = new Set(['p1', 'p2', 'p3', 'p4', 'p5']);
        expect(deriveVotes(doc({ voteResultPhrase: 'Με πέντε (5) θετικές ψήφους' }), five, null).votes.filter(v => v.origin === 'inferred')).toHaveLength(5);
    });
});

describe('deriveVotes with a counted tally and no phrase', () => {
    it('infers FOR from presence when the structured tally counts ΥΠΕΡ', () => {
        const d = doc({ voteResultPhrase: null, tally: { FOR: 2 } });
        const { votes, issues } = deriveVotes(d, new Set(['p1', 'p2']), null);
        expect(votes.filter(v => v.voteType === 'FOR')).toHaveLength(2);
        expect(issues).toEqual([]);
    });
});

