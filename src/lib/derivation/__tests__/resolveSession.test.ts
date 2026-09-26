import { pageStatementsOf } from '../anchors';
import { lateArrivalsInOpeningList, nameMatchIssues, pagesCarryOwnList, resolveEvents, resolveRollCall, resolveSession } from '../resolveSession';
import type { DecisionConventions } from '@/lib/decisionConventions';
import type { DerivationInput, DocumentFacts, OrderedSubject, PerVoteAbsence, StatedChange } from '../types';

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
        lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], perVoteAbsences: [], nameMatches: null,
        unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null,
        mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null, hasExtraction: true, statesBodyDecision: false, ...o,
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
    const base = { cityId: 'c', meetingId: 'm', conventions: conv(), subjects: [] as OrderedSubject[] };

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

describe('resolveEvents: per-vote absences (C5)', () => {
    // Items 1–6, decisions 30–35, one page each.
    const subjects: OrderedSubject[] = [1, 2, 3, 4, 5, 6].map(i => ({ id: `item${i}`, name: `item ${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: `${29 + i}/2026` }));
    const absence = (o: Partial<PerVoteAbsence> = {}): PerVoteAbsence => ({ personId: 'x', decisionNumberFrom: null, decisionNumberTo: null, rawText: 'απουσίαζε ο Χ', ...o });
    const pages = (absent: Record<number, PerVoteAbsence[]>) => subjects.map((s, i) => page(['a', 'x'], [], { subjectId: s.id, perVoteAbsences: absent[i + 1] ?? [] }));
    const resolve = (documents: DocumentFacts[], conventions = conv()) => resolveEvents({ cityId: 'c', meetingId: 'm', conventions, subjects, documents });
    const shape = (r: ReturnType<typeof resolve>) => r.events.map(e => [e.personId, e.kind, e.anchorKind, e.anchorSubjectId ?? e.anchorDecisionNumber, e.timing, e.reportingDocuments]);

    it('makes a run of consecutive subjects one departure before the first and one arrival before the next', () => {
        const r = resolve(pages({ 2: [absence()], 3: [absence()], 4: [absence()] }));
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'item2', 'BEFORE', 3], ['x', 'ARRIVAL', 'SUBJECT', 'item5', 'BEFORE', 3]]);
        expect(r.issues).toEqual([]);
    });

    it('makes two runs of subjects with a gap between them', () => {
        const r = resolve(pages({ 3: [absence()], 5: [absence()] }));
        expect(shape(r)).toEqual([
            ['x', 'DEPARTURE', 'SUBJECT', 'item3', 'BEFORE', 1], ['x', 'ARRIVAL', 'SUBJECT', 'item4', 'BEFORE', 1],
            ['x', 'DEPARTURE', 'SUBJECT', 'item5', 'BEFORE', 1], ['x', 'ARRIVAL', 'SUBJECT', 'item6', 'BEFORE', 1],
        ]);
    });

    it('states no return for a run that reaches the last subject', () => {
        expect(shape(resolve(pages({ 5: [absence()], 6: [absence()] })))).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'item5', 'BEFORE', 2]]);
    });

    it('keeps a run across a subject with no page or no usable reading, which states nothing', () => {
        const noPage = pages({ 2: [absence()], 4: [absence()] }).filter(d => d.subjectId !== 'item3');
        expect(shape(resolve(noPage))).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'item2', 'BEFORE', 2], ['x', 'ARRIVAL', 'SUBJECT', 'item5', 'BEFORE', 2]]);
        // A v3 or unread page: its reading states nothing either.
        const unread = pages({ 2: [absence()], 4: [absence()] }).map(d => (d.subjectId === 'item3' ? { ...d, hasExtraction: false } : d));
        expect(resolve(unread)).toEqual(resolve(noPage));
    });

    it('ends a run only at a later subject whose usable page leaves the absence out', () => {
        // Item 4 has no page: the return is before item 5, the next page that does not state the absence.
        const documents = pages({ 2: [absence()], 3: [absence()] }).filter(d => d.subjectId !== 'item4');
        expect(shape(resolve(documents)).map(e => [e[1], e[3]])).toEqual([['DEPARTURE', 'item2'], ['ARRIVAL', 'item5']]);
        // No page after the run: nothing states a return.
        const toTheEnd = pages({ 4: [absence()] }).filter(d => d.subjectId !== 'item5' && d.subjectId !== 'item6');
        expect(shape(resolve(toTheEnd)).map(e => [e[1], e[3]])).toEqual([['DEPARTURE', 'item4']]);
    });

    it('ends a run at the end of a range even when the next subject has no page', () => {
        // Items 2–3 are decisions 31–32. Item 4 has no page; item 5 states the absence as its own decision.
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '32' });
        const documents = pages({ 2: [range], 5: [absence()] }).filter(d => d.subjectId !== 'item4');
        expect(shape(resolve(documents)).map(e => [e[1], e[2], e[3]])).toEqual([
            ['DEPARTURE', 'DECISION_NUMBER', '31'], ['ARRIVAL', 'DECISION_NUMBER', '32'],
            ['DEPARTURE', 'SUBJECT', 'item5'], ['ARRIVAL', 'SUBJECT', 'item6'],
        ]);
    });

    it('makes a range stated on several pages one departure before its first decision and one arrival after its last', () => {
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '33', rawText: 'Εκτός αιθούσης στις με αρ. 31 – 33' });
        // Items 2–4 are decisions 31–33. Item 3 states it as its own decision: the same absence.
        const r = resolve(pages({ 2: [range], 3: [absence()], 4: [range] }));
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'DECISION_NUMBER', '31', 'BEFORE', 3], ['x', 'ARRIVAL', 'DECISION_NUMBER', '33', 'AFTER', 3]]);
        expect(r.events.map(e => e.rawText)).toEqual(['Εκτός αιθούσης στις με αρ. 31 – 33', 'Εκτός αιθούσης στις με αρ. 31 – 33']);
    });

    it('covers a subject with no decision number inside a range', () => {
        // Decisions 31, 32, (none), 33, 34, 35: the range 31–34 is one absence across the subject with no number.
        const numbered: OrderedSubject[] = ['31', '32', null, '33', '34', '35'].map((decisionNumber, i) => ({
            id: `n${i}`, name: `n${i}`, agendaItemIndex: i + 1, nonAgendaReason: null, decisionNumber,
        }));
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '34', rawText: 'Εκτός αιθούσης 31 – 34' });
        const documents = numbered.filter(s => s.decisionNumber !== null)
            .map(s => page(['a', 'x'], [], { subjectId: s.id, perVoteAbsences: s.id === 'n0' ? [range] : [] }));
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: numbered, documents });
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'DECISION_NUMBER', '31', 'BEFORE', 1], ['x', 'ARRIVAL', 'DECISION_NUMBER', '34', 'AFTER', 1]]);
    });

    it("gives a range boundary the sentence of the statement whose anchor it uses", () => {
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '33', rawText: 'Εκτός αιθούσης στις με αρ. 31 – 33' });
        // Item 2 (decision 31) states the absence as its own decision first; item 3 states the range.
        const r = resolve(pages({ 2: [absence()], 3: [range] }));
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'DECISION_NUMBER', '31', 'BEFORE', 2], ['x', 'ARRIVAL', 'DECISION_NUMBER', '33', 'AFTER', 2]]);
        expect(r.events.map(e => e.rawText)).toEqual(['Εκτός αιθούσης στις με αρ. 31 – 33', 'Εκτός αιθούσης στις με αρ. 31 – 33']);
        // A boundary at the subject keeps the sentence of the first statement there.
        const own = resolve(pages({ 2: [absence({ rawText: 'πρώτη' })], 3: [absence({ rawText: 'δεύτερη' })] }));
        expect(own.events.map(e => [e.kind, e.rawText])).toEqual([['DEPARTURE', 'πρώτη'], ['ARRIVAL', 'δεύτερη']]);
    });

    it('anchors at the subject a range boundary whose decision number places elsewhere', () => {
        // Decision 32 is missing from the meeting: «after 32» is before item 4 (decision 33), where the run ends.
        const documents = pages({ 2: [absence({ decisionNumberFrom: '31', decisionNumberTo: '32' })] }).filter(d => d.subjectId !== 'item3');
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: subjects.filter(s => s.id !== 'item3'), documents });
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'DECISION_NUMBER', '31', 'BEFORE', 1], ['x', 'ARRIVAL', 'SUBJECT', 'item4', 'BEFORE', 1]]);
    });

    it('keeps one departure and one arrival for an own-page absence off the order, so the replay can report the anchor', () => {
        const r = resolve([...pages({}), page(['a'], [], { subjectId: 'off-order', perVoteAbsences: [absence()] })]);
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'off-order', 'BEFORE', 1], ['x', 'ARRIVAL', 'SUBJECT', 'off-order', 'AFTER', 1]]);
    });

    /** The one UNPLACEABLE_ANCHOR a range that covers no numbered subject raises, and its page. */
    const rangeNotPlaced = (detail: string, decisionId: string) => ({
        code: 'UNPLACEABLE_ANCHOR', personId: 'x', decisionId, source: 'decision',
        params: { kind: 'DEPARTURE', reason: 'rangeNotInMeeting', detail },
    });

    it('places no event for a range above every decision of the meeting, and reports the range once', () => {
        const beyond = absence({ decisionNumberFrom: '90', decisionNumberTo: '95' });
        const documents = pages({ 1: [beyond], 2: [beyond] });
        const r = resolve(documents);
        expect(r.events).toEqual([]);
        expect(r.issues).toEqual([expect.objectContaining(rangeNotPlaced('90–95', documents[0].decisionId))]);
    });

    /** Subjects with these decision numbers in this order; null is a subject whose decision is not linked yet. */
    const numberedSubjects = (numbers: Array<string | null>): OrderedSubject[] => numbers.map((decisionNumber, i) => ({
        id: `n${i}`, name: `n${i}`, agendaItemIndex: i + 1, nonAgendaReason: null, decisionNumber,
    }));
    /** One usable page per numbered subject, with the absences given by decision number. */
    const pagesOf = (order: OrderedSubject[], absent: Record<string, PerVoteAbsence[]>) => order.filter(s => s.decisionNumber !== null)
        .map(s => page(['a', 'x'], [], { subjectId: s.id, perVoteAbsences: absent[s.decisionNumber!] ?? [] }));

    it('places no event for a range whose decisions are not linked yet, and reports it (partial poll)', () => {
        // Athens jan14 pattern: pages 5 and 6 state «Εκτός αιθούσης στις με αρ. 31 – 40». Decisions
        // 31–40 are not linked yet, so their subjects carry no number; decision 41 is linked.
        const order = numberedSubjects(['5', '6', ...Array<null>(10).fill(null), '41']);
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '40' });
        const documents = pagesOf(order, { 5: [range], 6: [range] });
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents });
        expect(r.events).toEqual([]);
        expect(r.issues).toEqual([expect.objectContaining(rangeNotPlaced('31–40', documents[0].decisionId))]);
    });

    it('places no event for a range below every decision of the meeting, and reports it', () => {
        // Agenda item numbers read as decision numbers, in a meeting numbered from 286.
        const order = numberedSubjects(['286', '287', '288']);
        const documents = pagesOf(order, { 287: [absence({ decisionNumberFrom: '3', decisionNumberTo: '5' })] });
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents });
        expect(r.events).toEqual([]);
        expect(r.issues).toEqual([expect.objectContaining(rangeNotPlaced('3–5', documents[1].decisionId))]);
    });

    it('reports a range as a whole when no subject of the meeting carries a decision number', () => {
        const order = numberedSubjects([null, null, null]);
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '40' });
        const documents = [page(['a', 'x'], [], { subjectId: 'n1', perVoteAbsences: [range] })];
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents });
        expect(r.events).toEqual([]);
        expect(r.issues).toEqual([expect.objectContaining({ ...rangeNotPlaced('31–40', documents[0].decisionId), params: { kind: 'DEPARTURE', reason: 'rangeNoDecisionNumbers', detail: '31–40' } })]);
    });

    it('reports a range as a whole when one of its decision numbers has no digits', () => {
        const order = numberedSubjects(['30', '31']);
        const documents = pagesOf(order, { 30: [absence({ decisionNumberFrom: '31', decisionNumberTo: 'σαράντα' })] });
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents });
        expect(r.events).toEqual([]);
        expect(r.issues).toEqual([expect.objectContaining({ ...rangeNotPlaced('31–σαράντα', documents[0].decisionId), params: { kind: 'DEPARTURE', reason: 'rangeNumberNoDigits', detail: '31–σαράντα' } })]);
    });

    it('continues a partly linked range across the subjects not linked yet, to the next subject outside it', () => {
        // Decisions 31–35 are linked, 36–40 are not, 41 is. The range 31–40 covers the five subjects with no
        // number after 35, so the member returns before decision 41, not before the first unlinked subject.
        const order = numberedSubjects(['30', '31', '32', '33', '34', '35', null, null, null, null, null, '41']);
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '40' });
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents: pagesOf(order, { 31: [range] }) });
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'DECISION_NUMBER', '31', 'BEFORE', 1], ['x', 'ARRIVAL', 'SUBJECT', 'n11', 'BEFORE', 1]]);
        expect(r.issues).toEqual([]);
    });

    it('starts a range whose first decisions are not linked yet after the last subject numbered below it', () => {
        // Decisions 31–33 are not linked, 34–40 are. The subjects with no number after decision 30 can hold
        // 31–33, so the member leaves before the first of them, not before decision 34.
        const order = numberedSubjects(['30', null, null, null, '34', '35', '36', '37', '38', '39', '40', '41']);
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '40' });
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents: pagesOf(order, { 34: [range] }) });
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'n1', 'BEFORE', 1], ['x', 'ARRIVAL', 'DECISION_NUMBER', '40', 'AFTER', 1]]);
        expect(r.issues).toEqual([]);
        // With no numbered subject before the range, the run starts at the first subject.
        const fromTheStart = numberedSubjects([null, null, '33', '34', '35']);
        const early = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: fromTheStart,
            documents: pagesOf(fromTheStart, { 33: [absence({ decisionNumberFrom: '31', decisionNumberTo: '34' })] }) });
        expect(shape(early)).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'n0', 'BEFORE', 1], ['x', 'ARRIVAL', 'DECISION_NUMBER', '34', 'AFTER', 1]]);
    });

    it('continues a range linked only in the middle across the subjects not linked yet at both ends', () => {
        // The range 31–36: decisions 31–32 and 35–36 are not linked, 33–34 are. The run starts after
        // decision 30 and ends before decision 37.
        const order = numberedSubjects(['30', null, null, '33', '34', null, null, '37']);
        const range = absence({ decisionNumberFrom: '31', decisionNumberTo: '36' });
        const r = resolveEvents({ cityId: 'c', meetingId: 'm', conventions: conv(), subjects: order, documents: pagesOf(order, { 33: [range], 34: [range] }) });
        expect(shape(r)).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'n1', 'BEFORE', 2], ['x', 'ARRIVAL', 'SUBJECT', 'n7', 'BEFORE', 2]]);
        expect(r.issues).toEqual([]);
    });

    it('gives the same events for the stored pair shape and the new entry', () => {
        const rawText = 'Κατά τη διαδικασία της ψηφοφορίας απουσίαζε ο Χ';
        const anchor = { agendaItemIndex: null, nonAgendaReason: null, decisionNumber: null, phase: null };
        const pair = (subjectId: string) => [
            { personId: 'x', name: 'Χ', type: 'departure', rawText, anchor: { ...anchor, kind: 'subject', subjectId, timing: 'before' } },
            { personId: 'x', name: 'Χ', type: 'arrival', rawText, anchor: { ...anchor, kind: 'subject', subjectId, timing: 'after' } },
        ];
        const entry = { personId: 'x', name: 'Χ', type: 'absent_for_vote', rawText, anchor: { ...anchor, kind: 'this_document', decisionNumberTo: null, timing: null } };
        const read = (entries: (subjectId: string) => unknown[]) =>
            subjects.map((s, i) => page(['a', 'x'], [], { subjectId: s.id, ...pageStatementsOf(i >= 1 && i <= 3 ? entries(s.id) : []) }));
        const stored = resolve(read(pair)), fresh = resolve(read(() => [entry]));
        expect(stored).toEqual(fresh);
        expect(shape(fresh)).toEqual([['x', 'DEPARTURE', 'SUBJECT', 'item2', 'BEFORE', 3], ['x', 'ARRIVAL', 'SUBJECT', 'item5', 'BEFORE', 3]]);
    });

    it('orders the absences with the changes pinned to pages, by their first statement, after the session changes', () => {
        const pinned: StatedChange = { ...departure('y', 0), anchorKind: 'SUBJECT', anchorAgendaItemIndex: null, anchorSubjectId: 'item3', timing: 'DURING' };
        const documents = pages({ 2: [absence()], 3: [absence()] });
        documents[2] = { ...documents[2], statedChanges: [pinned, departure('z', 1)] };
        documents[3] = { ...documents[3], statedChanges: [departure('z', 1)] };
        const r = resolve(documents, conv({ presentListMeaning: 'per_decision' }));
        expect(r.events.map(e => [e.personId, e.kind, e.id])).toEqual([
            ['z', 'DEPARTURE', 'c:m:ev0000'], ['x', 'DEPARTURE', 'c:m:ev0001'], ['x', 'ARRIVAL', 'c:m:ev0002'], ['y', 'DEPARTURE', 'c:m:ev0003'],
        ]);
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
        expect(lateArrivalsInOpeningList({ conventions: conv(), documents: [page(['a'], [], { statedChanges: [arrival('a', 'SESSION_START')] })] })).toEqual([]);
        // The stored pair of an older reading is a per-vote absence, not a stated arrival.
        const anchor = { kind: 'subject', subjectId: 's', agendaItemIndex: null, nonAgendaReason: null, decisionNumber: null, phase: null };
        const pair = pageStatementsOf([
            { personId: 'a', name: 'Α', type: 'departure', rawText: 'απουσίαζε ο Α', anchor: { ...anchor, timing: 'before' } },
            { personId: 'a', name: 'Α', type: 'arrival', rawText: 'απουσίαζε ο Α', anchor: { ...anchor, timing: 'after' } },
        ]);
        expect(lateArrivalsInOpeningList({ conventions: conv(), documents: [page(['a'], [], pair)] })).toEqual([]);
    });

    it("reports an arrival pinned to the page's own subject in an opening list", () => {
        // «προσήλθε κατά τη συζήτηση του θέματος» on the page of that subject, with the member under ΠΑΡΟΝΤΕΣ.
        const pages = [page(['a'], [], { statedChanges: [arrival('a', 'SUBJECT')] })];
        expect(lateArrivalsInOpeningList({ conventions: conv(), documents: pages })).toEqual([
            expect.objectContaining({ code: 'LATE_ARRIVAL_IN_OPENING_LIST', personId: 'a', decisionId: pages[0].decisionId }),
        ]);
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
