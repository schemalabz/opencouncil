import { lateArrivalsInOpeningList, nameMatchIssues, pagesCarryOwnList, resolveEvents, resolveRollCall, resolveSession } from '../resolveSession';
import type { DecisionConventions } from '@/lib/decisionConventions';
import type { DerivationInput, DocumentFacts, StatedChange } from '../types';

const conv = (o: Partial<DecisionConventions> = {}): DecisionConventions => ({
    version: 1, rollCallLayout: 'present_and_absent', presentListMeaning: 'opening', attendanceChangeAnchors: ['agenda_item'],
    statesPerDecisionAttendance: false, statesPerVoteAbsence: false, usesSubstitutes: false, namedVoters: 'dissenters_only',
    mayorStatedSeparately: false, provenance: { source: 'profile' }, ...o,
});
let n = 0;
const page = (present: string[], absent: string[] = [], o: Partial<DocumentFacts> = {}): DocumentFacts => {
    n += 1;
    return {
        subjectId: `s${n}`, decisionId: `d${n}`, voteResultPhrase: null, namedVotes: [], tally: null, presentIds: null, absentIds: null,
        rollCallPresentIds: present.length + absent.length ? present : null, rollCallAbsentIds: present.length + absent.length ? absent : null,
        lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], nameMatches: null,
        unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null,
        mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null, hasExtraction: true, ...o,
    };
};
const departure = (personId: string, item: number, timing: StatedChange['timing'] = 'AFTER'): StatedChange => ({
    personId, kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: item, anchorNonAgendaReason: null, anchorDecisionNumber: null,
    anchorSubjectId: null, anchorPhase: null, timing, rawText: `ο ${personId} αποχώρησε μετά το ${item}ο θέμα`,
});
const statusMap = (rows: Array<{ personId: string; status: string }>) => Object.fromEntries(rows.map(r => [r.personId, r.status]));

describe('resolveRollCall', () => {
    const base = { conventions: conv(), cityMayorPersonId: null };

    it('says why there is none when no usable page prints a roll call', () => {
        expect(resolveRollCall({ ...base, documents: [page([]), page(['a'], [], { hasExtraction: false })] })).toMatchObject({ rollCall: [], missing: 'noRollCall' });
    });

    it('takes the roll call more than half of the pages print; one outlier does not poison it', () => {
        const r = resolveRollCall({ ...base, documents: [page(['a', 'b', 'c'], ['d']), page(['c', 'a', 'b'], ['d']), page(['a', 'b', 'c'], ['d']), page(['a'], ['b', 'c', 'd'])] });
        expect(statusMap(r.rollCall)).toEqual({ a: 'PRESENT', b: 'PRESENT', c: 'PRESENT', d: 'ABSENT' });
        expect(r.rollCall.every(x => x.source === 'decision')).toBe(true);
    });

    it('refuses when no roll call has a strict majority, and says so', () => {
        const r = resolveRollCall({ ...base, documents: [page(['a', 'b'], ['c']), page(['a', 'c'], ['b']), page(['b', 'c'], ['a'])] });
        expect(r).toMatchObject({ rollCall: [], missing: 'noMajority' });
        const tie = resolveRollCall({ ...base, documents: [page(['a'], ['b']), page(['a'], ['b']), page(['a', 'b']), page(['a', 'b'])] });
        expect(tie).toMatchObject({ rollCall: [], missing: 'noMajority' });
    });

    it('takes the first page for a per-decision body, whose pages differ by design', () => {
        const r = resolveRollCall({ ...base, conventions: conv({ presentListMeaning: 'per_decision' }),
            documents: [page(['a'], ['b']), page(['a', 'b']), page(['a', 'b'])] });
        expect(statusMap(r.rollCall)).toEqual({ a: 'PRESENT', b: 'ABSENT' });
    });

    it('takes the first page that prints a roll call for a per-decision body whose first page prints none', () => {
        const r = resolveRollCall({ ...base, conventions: conv({ presentListMeaning: 'per_decision' }),
            documents: [page([]), page(['a'], ['b']), page(['a', 'b'])] });
        expect(r.missing).toBeNull();
        expect(statusMap(r.rollCall)).toEqual({ a: 'PRESENT', b: 'ABSENT' });
    });

    it('keeps a person in both lists of the winning page absent and reports each page', () => {
        const r = resolveRollCall({ ...base, documents: [page(['a', 'b'], ['b']), page(['a', 'b'], ['b'])] });
        expect(statusMap(r.rollCall)).toEqual({ a: 'PRESENT', b: 'ABSENT' });
        expect(r.issues.map(i => [i.code, i.personId, i.decisionId])).toEqual([['PERSON_IN_BOTH_LISTS', 'b', expect.any(String)], ['PERSON_IN_BOTH_LISTS', 'b', expect.any(String)]]);
    });

    it("adds the mayor's row from the winning pages' majority, and none on a tie", () => {
        const withMayor = (mayorPresent: boolean | null) => page(['a'], [], { mayorPresent });
        expect(statusMap(resolveRollCall({ ...base, cityMayorPersonId: 'm', documents: [withMayor(true), withMayor(true), withMayor(false)] }).rollCall).m).toBe('PRESENT');
        expect(statusMap(resolveRollCall({ ...base, cityMayorPersonId: 'm', documents: [withMayor(true), withMayor(false)] }).rollCall).m).toBeUndefined();
        expect(resolveRollCall({ ...base, cityMayorPersonId: 'a', documents: [withMayor(false)] }).rollCall).toEqual([{ personId: 'a', status: 'PRESENT', source: 'decision' }]);
    });
});

describe('resolveRollCall rollCallBasis', () => {
    const base = { conventions: conv(), cityMayorPersonId: null };

    it('is zero when no usable page prints a roll call', () => {
        expect(resolveRollCall({ ...base, documents: [page([]), page(['a'], [], { hasExtraction: false })] }).rollCallBasis)
            .toEqual({ pagesAgreeing: 0, pagesWithRollCall: 0, strategy: 'majority' });
    });

    it('counts the winning group against every page that printed one, majority rule', () => {
        const r = resolveRollCall({ ...base, documents: [page(['a', 'b', 'c'], ['d']), page(['c', 'a', 'b'], ['d']), page(['a', 'b', 'c'], ['d']), page(['a'], ['b', 'c', 'd'])] });
        expect(r.rollCallBasis).toEqual({ pagesAgreeing: 3, pagesWithRollCall: 4, strategy: 'majority' });
    });

    it('counts the largest group even where it falls short of a majority', () => {
        const r = resolveRollCall({ ...base, documents: [page(['a', 'b'], ['c']), page(['a', 'c'], ['b']), page(['b', 'c'], ['a'])] });
        expect(r).toMatchObject({ missing: 'noMajority' });
        expect(r.rollCallBasis).toEqual({ pagesAgreeing: 1, pagesWithRollCall: 3, strategy: 'majority' });
    });

    it('counts one page against every page that printed one, per-decision rule', () => {
        const r = resolveRollCall({ ...base, conventions: conv({ presentListMeaning: 'per_decision' }),
            documents: [page([]), page(['a'], ['b']), page(['a', 'b'])] });
        expect(r.rollCallBasis).toEqual({ pagesAgreeing: 1, pagesWithRollCall: 2, strategy: 'first-page' });
    });

    it("exposes the strategy the body's conventions select even where no majority is reached", () => {
        expect(resolveRollCall({ ...base, documents: [page([])] }).rollCallBasis.strategy).toBe('majority');
        expect(resolveRollCall({ ...base, conventions: conv({ presentListMeaning: 'per_decision' }), documents: [page([])] }).rollCallBasis.strategy).toBe('first-page');
    });
});

describe('resolveEvents', () => {
    const base = { cityId: 'c', meetingId: 'm', conventions: conv() };

    it('keeps a change more than half of the pages state, with its count', () => {
        const r = resolveEvents({ ...base, documents: [page(['a']), page(['a'], [], { statedChanges: [departure('b', 1)] }), page(['a'], [], { statedChanges: [departure('b', 1)] })] });
        expect(r.events).toEqual([expect.objectContaining({ personId: 'b', kind: 'DEPARTURE', reportingDocuments: 2, totalDocuments: 3, source: 'decision', id: 'c:m:ev0000' })]);
        expect(r.issues).toEqual([]);
    });

    it('drops a change at half or less of the pages, and reports it', () => {
        const r = resolveEvents({ ...base, documents: [page(['a'], [], { statedChanges: [departure('b', 1)] }), page(['a'])] });
        expect(r.events).toEqual([]);
        expect(r.issues).toEqual([expect.objectContaining({ code: 'CHANGE_NOT_CORROBORATED', personId: 'b', params: { stated: 1, total: 2 } })]);
    });

    it('counts a page that states the change twice once', () => {
        const twice = page(['a'], [], { statedChanges: [departure('b', 1), departure('b', 1)] });
        const r = resolveEvents({ ...base, documents: [twice, page(['a']), page(['a'])] });
        expect(r.events).toEqual([]);
        expect(r.issues[0]).toMatchObject({ params: { stated: 1, total: 3 } });
    });

    it('keeps every stated change where the pages carry their own list', () => {
        const withList = (o: Partial<DocumentFacts> = {}) => page(['a'], [], { presentIds: ['a'], ...o });
        for (const conventions of [conv({ statesPerDecisionAttendance: true }), conv({ presentListMeaning: 'per_decision' })]) {
            const r = resolveEvents({ ...base, conventions, documents: [withList({ statedChanges: [departure('b', 1)] }), withList(), withList()] });
            expect(r.events.map(e => e.personId)).toEqual(['b']);
            expect(r.issues).toEqual([]);
        }
    });

    it('takes session changes by majority in a ΤΑ ΜΕΛΗ body whose pages print no list', () => {
        const r = resolveEvents({ ...base, conventions: conv({ statesPerDecisionAttendance: true }), documents: [
            page(['a'], [], { statedChanges: [departure('b', 1), departure('c', 2)] }),
            page(['a'], [], { statedChanges: [departure('b', 1)] }),
            page(['a']),
        ] });
        expect(r.events.map(e => e.personId)).toEqual(['b']);
        expect(r.issues).toEqual([expect.objectContaining({ code: 'CHANGE_NOT_CORROBORATED', personId: 'c', params: { stated: 1, total: 3 } })]);
    });

    it('takes the timing most pages give, preferring during on a tie and any timing over none', () => {
        const pages = [page(['a'], [], { statedChanges: [departure('b', 1, 'AFTER')] }), page(['a'], [], { statedChanges: [departure('b', 1, 'DURING')] })];
        expect(resolveEvents({ ...base, conventions: conv({ statesPerDecisionAttendance: true }), documents: pages }).events[0].timing).toBe('DURING');
        const withNull = [page(['a'], [], { statedChanges: [departure('b', 1, null)] }), page(['a'], [], { statedChanges: [departure('b', 1, 'AFTER')] })];
        expect(resolveEvents({ ...base, conventions: conv({ statesPerDecisionAttendance: true }), documents: withNull }).events[0].timing).toBe('AFTER');
    });

    it('keeps the timing of the first page that states the change on an AFTER against BEFORE tie', () => {
        const timingOf = (first: StatedChange['timing'], second: StatedChange['timing']) => resolveEvents({ ...base, conventions: conv({ statesPerDecisionAttendance: true }),
            documents: [page(['a'], [], { statedChanges: [departure('b', 1, first)] }), page(['a'], [], { statedChanges: [departure('b', 1, second)] })] }).events[0].timing;
        expect(timingOf('AFTER', 'BEFORE')).toBe('AFTER');
        expect(timingOf('BEFORE', 'AFTER')).toBe('BEFORE');
    });

    it('orders session changes and their ids by the first page that states each', () => {
        // Page 2 states b before c, but c is first stated on page 1.
        const r = resolveEvents({ ...base, documents: [
            page(['a'], [], { statedChanges: [departure('c', 2)] }),
            page(['a'], [], { statedChanges: [departure('b', 1), departure('c', 2)] }),
            page(['a'], [], { statedChanges: [departure('b', 1)] }),
        ] });
        expect(r.events.map(e => [e.personId, e.id])).toEqual([['c', 'c:m:ev0000'], ['b', 'c:m:ev0001']]);
    });

    it("always keeps a change pinned to the page's own decision, after the session changes", () => {
        const own: StatedChange = { ...departure('c', 0), anchorKind: 'SUBJECT', anchorAgendaItemIndex: null, anchorSubjectId: 's-own', timing: 'BEFORE' };
        const r = resolveEvents({ ...base, documents: [page(['a'], [], { statedChanges: [own, departure('b', 1)] }), page(['a'], [], { statedChanges: [departure('b', 1)] })] });
        expect(r.events.map(e => [e.personId, e.anchorKind, e.reportingDocuments])).toEqual([['b', 'AGENDA_ITEM', 2], ['c', 'SUBJECT', 1]]);
    });

    it('ignores a page without a usable reading', () => {
        const r = resolveEvents({ ...base, documents: [page(['a'], [], { statedChanges: [departure('b', 1)] }), page(['a'], [], { hasExtraction: false })] });
        expect(r.events.map(e => [e.personId, e.totalDocuments])).toEqual([['b', 1]]);
    });
});

describe('pagesCarryOwnList', () => {
    it('is true for a per-decision roll call, or a per-decision member list that a page prints', () => {
        const listed = [page(['a']), page(['a'], [], { presentIds: ['a'] })];
        const unlisted = [page(['a']), page(['a'])];
        expect(pagesCarryOwnList(conv({ presentListMeaning: 'per_decision' }), unlisted)).toBe(true);
        expect(pagesCarryOwnList(conv({ statesPerDecisionAttendance: true }), listed)).toBe(true);
        expect(pagesCarryOwnList(conv({ statesPerDecisionAttendance: true }), unlisted)).toBe(false);
        expect(pagesCarryOwnList(conv(), listed)).toBe(false);
        expect(pagesCarryOwnList(null, listed)).toBe(false);
    });
});

describe('lateArrivalsInOpeningList', () => {
    const arrival = (personId: string, anchorKind: StatedChange['anchorKind'] = 'AGENDA_ITEM'): StatedChange => ({
        ...departure(personId, 3), kind: 'ARRIVAL', anchorKind, timing: 'DURING', rawText: `ο ${personId} προσήλθε κατά τη συζήτηση του 3ου θέματος`,
    });

    it('reports a page of an opening body that lists a late arrival as present', () => {
        const pages = [page(['a'], ['g'], { statedChanges: [arrival('g')] }), page(['a', 'g'], [], { statedChanges: [arrival('g')] })];
        const issues = lateArrivalsInOpeningList({ conventions: conv({ presentListMeaning: 'opening' }), documents: pages });
        expect(issues).toEqual([expect.objectContaining({ code: 'LATE_ARRIVAL_IN_OPENING_LIST', personId: 'g', decisionId: pages[1].decisionId })]);
    });

    it('says nothing for a cumulative body, a session-start arrival or a return after a per-vote absence', () => {
        const pages = [page(['a', 'g'], [], { statedChanges: [arrival('g'), arrival('a', 'SESSION_START'), arrival('a', 'SUBJECT')] })];
        expect(lateArrivalsInOpeningList({ conventions: conv({ presentListMeaning: 'cumulative' }), documents: pages })).toEqual([]);
        expect(lateArrivalsInOpeningList({ conventions: conv(), documents: [page(['a'], [], { statedChanges: [arrival('a', 'SESSION_START'), arrival('a', 'SUBJECT')] })] })).toEqual([]);
    });
});

describe('resolveSession', () => {
    it('returns the roll call, the events and the issues of both parts', () => {
        const input: DerivationInput = {
            cityId: 'c', meetingId: 'm', subjects: [], rollCall: [], events: [], subjectIdsWithStoredVotes: [], conventions: conv(),
            mayorPersonId: null, presidentPersonId: null, secretaryPersonId: null, bodyType: null, cityMayorPersonId: null,
            documents: [page(['a', 'b'], ['b'], { statedChanges: [departure('c', 1)] }), page(['a', 'b'], ['b'])],
        };
        const r = resolveSession(input);
        expect(r.missing).toBeNull();
        expect(statusMap(r.rollCall)).toEqual({ a: 'PRESENT', b: 'ABSENT' });
        expect(r.rollCallBasis).toEqual({ pagesAgreeing: 2, pagesWithRollCall: 2, strategy: 'majority' });
        expect(r.events).toEqual([]);
        expect(r.issues.map(i => [i.code, i.personId])).toEqual([['PERSON_IN_BOTH_LISTS', 'b'], ['PERSON_IN_BOTH_LISTS', 'b'], ['CHANGE_NOT_CORROBORATED', 'c']]);
    });
});

describe('nameMatchIssues', () => {
    it('reports two entries of one list that received one id, and not one member written two ways in two lists', () => {
        const athens = page(['p1'], [], {
            lists: { rollCallPresent: ['Καββαθάς Τρύφων', 'Κωνσταντίνου Πέτρος'], rollCallAbsent: [], decisionPresent: [] },
            nameMatches: [{ name: 'Καββαθάς Τρύφων', personId: 'p1', method: 'llm' }, { name: 'Κωνσταντίνου Πέτρος', personId: 'p1', method: 'token' }],
        });
        const argos = page(['p2'], [], {
            lists: { rollCallPresent: ['Αναγνωστόπουλος Κων/νος'], rollCallAbsent: [], decisionPresent: ['Αναγνωστόπουλος Κώστας'] },
            nameMatches: [{ name: 'Αναγνωστόπουλος Κων/νος', personId: 'p2', method: 'llm' }, { name: 'Αναγνωστόπουλος Κώστας', personId: 'p2', method: 'llm' }],
        });
        expect(nameMatchIssues({ documents: [athens, argos] })).toEqual([
            expect.objectContaining({ code: 'NAMES_SHARE_ID', decisionId: athens.decisionId, personId: 'p1', params: { names: 'Καββαθάς Τρύφων, Κωνσταντίνου Πέτρος' } }),
        ]);
    });

    it('reports one printed name that received two ids across pages', () => {
        const one = page(['p1'], [], { nameMatches: [{ name: 'Κων/νος Αναγνωστόπουλος', personId: 'p1', method: 'llm' }] });
        const two = page(['p9'], [], { nameMatches: [{ name: 'Κων/νος Αναγνωστόπουλος', personId: 'p9', method: 'llm' }] });
        expect(nameMatchIssues({ documents: [one, two] })).toEqual([expect.objectContaining({ code: 'NAME_MATCHED_TWICE', params: { name: 'Κων/νος Αναγνωστόπουλος' } })]);
    });

    it('says nothing for readings that predate the field', () => {
        expect(nameMatchIssues({ documents: [page(['p1']), page(['p1'])] })).toEqual([]);
    });
});
