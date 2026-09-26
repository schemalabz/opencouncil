/**
 * Reading a stored extraction into facts. The stored JSON is the poll's own
 * payload, so the shapes are known — what is not known is whether the people it
 * names still exist: an id left behind by a deleted person fails the foreign key
 * inside replaceDerivedRows and aborts the whole write, which would leave the
 * meeting underivable for good.
 */
// The module reaches Prisma through readDerivationRows; the pure half under test does not.
jest.mock('@/lib/db/derivationFacts', () => ({ readDerivationRows: jest.fn(), replaceDerivedRows: jest.fn() }));

import { documentFactsFromDecision, readingStatesFacts } from '../load';

const decision = (extraction: unknown, extractorVersion: string | null = '4') => ({
    id: 'd1', subjectId: 's1', voteResultPhrase: 'Κατά πλειοψηφία', unmatchedNames: ['Άγνωστος Α.'],
    incomplete: false, mayorPresent: null, declaredItemNumber: null, declaredOutOfAgenda: null, extraction, extractorVersion,
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

    it('reads whether the page says ΑΠΟΦΑΣΙΖΕΙ, which a body writes and a mayor does not', () => {
        const says = (excerpt: unknown, version = '4') => documentFactsFromDecision(decision({ excerpt }, version), roster).statesBodyDecision;
        expect(says('**ΟΜΟΦΩΝΑ ΑΠΟΦΑΣΙΖΕΙ** Την έγκριση')).toBe(true);
        expect(says('Το Συμβούλιο αποφασίζει ομόφωνα')).toBe(true);
        // Printed with spaced letters (26 pages of Sparta on c1sample).
        expect(says('Το Συμβούλιο **Α π ο φ α σ ί ζ ε ι** ομόφωνα')).toBe(true);
        expect(says('Α Π Ο Φ Α Σ Ι Ζ Ε Ι')).toBe(true);
        // A mayor's own decision (argithea 68ΛΠΩΨ3-Γ1Ρ).
        expect(says('**ΑΠΟΦΑΣΙΖΟΥΜΕ** Εγκρίνουμε τη δέσμευση πίστωσης')).toBe(false);
        expect(says('Α π ο φ α σ ί ζ ο υ μ ε')).toBe(false);
        expect(says(undefined)).toBe(false);
        expect(says('ΑΠΟΦΑΣΙΖΕΙ', '3')).toBe(false);
    });

    it('does not believe the list for someone the same page says was out for the vote', () => {
        // Argos 6Ι9ΑΩΨΔ-0Υ8: the reader returned the ΑΠΟΧΩΡΗΣΑΝΤΕΣ column as the members list — one name, the departed one.
        const facts = documentFactsFromDecision(decision({
            decisionAttendance: { presentIds: ['p1', 'p2'] },
            attendanceChanges: [{ type: 'departure', personId: 'p2', anchor: { kind: 'subject' } }],
        }), roster);
        expect(facts.presentIds).toEqual(['p1']);
        // Only that one: the same list with the departure anchored elsewhere is believed whole.
        expect(documentFactsFromDecision(decision({ decisionAttendance: { presentIds: ['p1', 'p2'] }, attendanceChanges: [{ type: 'departure', personId: 'p2', anchor: { kind: 'agenda_item' } }] }), roster).presentIds).toEqual(['p1', 'p2']);
    });

    it('reads a departure anchored `this_document` (task v3 vocabulary) as out for this page\'s vote', () => {
        // The legacy anchor maps to SUBJECT, so the list is not believed for that person either.
        const facts = documentFactsFromDecision(decision({
            decisionAttendance: { presentIds: ['p1', 'p2'] },
            attendanceChanges: [{ type: 'departure', personId: 'p2', anchor: { kind: 'this_document' } }],
        }), roster);
        expect(facts.statedChanges).toEqual([expect.objectContaining({ personId: 'p2', kind: 'DEPARTURE', anchorKind: 'SUBJECT' })]);
        expect(facts.presentIds).toEqual(['p1']);
    });
    it('does not believe the list for someone out for this vote, in either stored shape of a per-vote absence', () => {
        const absent = (anchor: Record<string, unknown>) => ({ type: 'absent_for_vote', personId: 'p2', rawText: 'απουσίαζε', anchor });
        const pair = [
            { type: 'departure', personId: 'p2', rawText: 'απουσίαζε', anchor: { kind: 'subject', subjectId: 's1', timing: 'before' } },
            { type: 'arrival', personId: 'p2', rawText: 'απουσίαζε', anchor: { kind: 'subject', subjectId: 's1', timing: 'after' } },
        ];
        const read = (attendanceChanges: unknown[], decisionNumber: string | null = '35/2026') =>
            documentFactsFromDecision({ ...decision({ decisionAttendance: { presentIds: ['p1', 'p2'] }, attendanceChanges }), decisionNumber }, roster);
        expect(read(pair).presentIds).toEqual(['p1']);
        expect(read(pair).perVoteAbsences).toEqual([{ personId: 'p2', decisionNumberFrom: null, decisionNumberTo: null, rawText: 'απουσίαζε' }]);
        expect(read(pair).statedChanges).toEqual([]);
        expect(read([absent({ kind: 'this_document' })]).presentIds).toEqual(['p1']);
        // A range stated on this page covers this page only when it includes this page's decision.
        expect(read([absent({ kind: 'decision_number', decisionNumber: '31', decisionNumberTo: '40' })]).presentIds).toEqual(['p1']);
        expect(read([absent({ kind: 'decision_number', decisionNumber: '36', decisionNumberTo: '40' })]).presentIds).toEqual(['p1', 'p2']);
        expect(read([absent({ kind: 'decision_number', decisionNumber: '31', decisionNumberTo: '40' })], null).presentIds).toEqual(['p1', 'p2']);
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

    it('a reading older than v4 states nothing, whatever it stored', () => {
        // v3 stored the answer the old pipeline had inferred: its `voteDetails`
        // already held the FOR votes it invented. Believing one returns those as
        // stated votes. Seen on zografou/apr1_2026: 11 v3 decisions, 61 stated FOR.
        const facts = documentFactsFromDecision(decision({
            voteDetails: [{ personId: 'p1', vote: 'FOR' }],
            decisionAttendance: { presentIds: ['p1', 'p2'] },
            rollCall: { layout: 'present_and_absent', presentIds: ['p1'] },
        }, '3'), roster);
        expect(facts.hasExtraction).toBe(false);
        expect(facts.namedVotes).toEqual([]);
        expect(facts.presentIds).toBeNull();
        expect(facts.rollCallPresentIds).toBeNull();
        expect(facts.rollCallLayout).toBeNull();
    });

    it('a decision read before facts were stored has no extraction', () => {
        const facts = documentFactsFromDecision(decision(null), roster);
        expect(facts.hasExtraction).toBe(false);
        expect(facts.namedVotes).toEqual([]);
        expect(facts.presentIds).toBeNull();
    });
});

describe('readingStatesFacts', () => {
    it.each([
        [{ extraction: {}, extractorVersion: '4' }, true],
        // A later task version must not start a re-read loop.
        [{ extraction: {}, extractorVersion: '5' }, true],
        [{ extraction: {}, extractorVersion: '3' }, false],
        // Number(null) is 0; a null or unparseable version is unread.
        [{ extraction: {}, extractorVersion: null }, false],
        [{ extraction: {}, extractorVersion: 'v4' }, false],
        [{ extraction: null, extractorVersion: '4' }, false],
    ])('%j → %s', (d, want) => {
        expect(readingStatesFacts(d)).toBe(want);
    });
});

describe('documentFactsFromDecision: stated changes and name matches', () => {
    const decision = (extraction: unknown) => ({
        id: 'd1', subjectId: 's1', voteResultPhrase: null, unmatchedNames: [], incomplete: false, mayorPresent: null,
        declaredItemNumber: null, declaredOutOfAgenda: null, extractorVersion: '4', extraction,
    });
    const change = (personId: string | null) => ({ personId, name: 'Χ', type: 'departure', rawText: 'αποχώρησε',
        anchor: { kind: 'agenda_item', agendaItemIndex: 2, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: 'after' } });

    it('reads each stated change of a person on the roster, and drops the rest', () => {
        const facts = documentFactsFromDecision(decision({ attendanceChanges: [change('p1'), change('gone'), change(null)] }), new Set(['p1']));
        expect(facts.statedChanges.map(c => c.personId)).toEqual(['p1']);
        const absent = (personId: string) => ({ ...change(personId), type: 'absent_for_vote' });
        expect(documentFactsFromDecision(decision({ attendanceChanges: [absent('p1'), absent('gone')] }), new Set(['p1'])).perVoteAbsences.map(a => a.personId)).toEqual(['p1']);
    });

    it('reads the name matches when the reading has them, and null when it predates them', () => {
        const nameMatches = [{ name: 'Κων/νος Αναγνωστόπουλος', personId: 'p1', method: 'llm' }, { name: 'Κώστας Αναγνωστόπουλος', personId: null, method: null }];
        expect(documentFactsFromDecision(decision({ nameMatches }), new Set(['p1'])).nameMatches).toEqual(nameMatches);
        expect(documentFactsFromDecision(decision({}), new Set(['p1'])).nameMatches).toBeNull();
    });

    it('states nothing for a v3 reading', () => {
        const facts = documentFactsFromDecision({ ...decision({ attendanceChanges: [change('p1')] }), extractorVersion: '3' }, new Set(['p1']));
        expect(facts.statedChanges).toEqual([]);
    });
});
