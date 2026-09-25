import { replayAttendance } from '../replayAttendance';
import type { DocumentFacts, EventRow, OrderedSubject, RollCallRow } from '../types';
import type { DecisionConventions } from '@/lib/decisionConventions';

const conv = (o: Partial<DecisionConventions> = {}): DecisionConventions => ({
    version: 1, rollCallLayout: 'present_and_absent', presentListMeaning: 'opening', attendanceChangeAnchors: ['agenda_item'],
    statesPerDecisionAttendance: false, statesPerVoteAbsence: false, usesSubstitutes: false, namedVoters: 'dissenters_only',
    mayorStatedSeparately: true, provenance: { source: 'profile' }, ...o,
});
const subj = (id: string, idx: number): OrderedSubject => ({ id, name: id, agendaItemIndex: idx, nonAgendaReason: null, decisionNumber: null });
const rc = (personId: string, status: 'PRESENT' | 'ABSENT' = 'PRESENT', source: RollCallRow['source'] = 'decision'): RollCallRow => ({ personId, status, source });
const ev = (o: Partial<EventRow>): EventRow => ({ id: 'e', personId: 'p1', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: null,
    anchorNonAgendaReason: null, anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'DURING', rawText: 'left',
    reportingDocuments: 1, totalDocuments: 1, source: 'decision', ...o });
const doc = (subjectId: string, o: Partial<DocumentFacts> = {}): DocumentFacts => ({ subjectId, decisionId: 'd-' + subjectId, voteResultPhrase: null, namedVotes: [],
    tally: null, presentIds: null, absentIds: null, rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], nameMatches: null, unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null, mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null, hasExtraction: true, ...o });
const subjects = [subj('s1', 1), subj('s2', 2), subj('s3', 3)];
const present = (r: ReturnType<typeof replayAttendance>, s: string) => [...r.presentBySubject.get(s) ?? []].sort();

describe('replayAttendance', () => {
    it('replays departures and arrivals along the order', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2'), rc('p3', 'ABSENT')], conventions: conv(), mayorPersonId: null, documents: [],
            events: [ev({ personId: 'p1', anchorAgendaItemIndex: 2 }), ev({ personId: 'p3', kind: 'ARRIVAL', anchorAgendaItemIndex: 2, timing: 'AFTER' })] });
        expect(present(r, 's1')).toEqual(['p1', 'p2']); expect(present(r, 's2')).toEqual(['p2']); expect(present(r, 's3')).toEqual(['p2', 'p3']);
        expect(r.attendance.filter(a => a.subjectId === 's2')).toEqual(expect.arrayContaining([
            { subjectId: 's2', personId: 'p1', status: 'ABSENT', origin: 'derived' }, { subjectId: 's2', personId: 'p2', status: 'PRESENT', origin: 'derived' }]));
        expect(r.issues).toEqual([]);
    });
    it('a per-vote absence pair removes the member for one subject only', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ statesPerVoteAbsence: true }), mayorPersonId: null, documents: [],
            events: [ev({ id: 'a', personId: 'p1', anchorKind: 'SUBJECT', anchorSubjectId: 's2', timing: 'BEFORE' }), ev({ id: 'b', personId: 'p1', kind: 'ARRIVAL', anchorKind: 'SUBJECT', anchorSubjectId: 's2', timing: 'AFTER' })] });
        expect(present(r, 's1')).toEqual(['p1', 'p2']); expect(present(r, 's2')).toEqual(['p2']); expect(present(r, 's3')).toEqual(['p1', 'p2']);
    });
    it('the mayor is walked but never emitted', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('mayor')], conventions: conv(), mayorPersonId: 'mayor', documents: [], events: [ev({ personId: 'mayor', anchorAgendaItemIndex: 3 })] });
        expect(r.attendance.some(a => a.personId === 'mayor')).toBe(false);
        expect(present(r, 's3')).toEqual(['p1']);
    });
    it('under a per-decision roll call each document\'s own ΠΑΡΟΝΤΕΣ is its item\'s state, and no change is implied', () => {
        // Argos ΔΣ 3/12/2025: items 1–2 print Μπουλούκος under ΑΠΟΝΤΕΣ, items 3–5 under ΠΑΡΟΝΤΕΣ («στην αρχή του παρόντος θέματος προσήλθε»).
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ presentListMeaning: 'per_decision' }), mayorPersonId: null, events: [],
            documents: [doc('s1', { rollCallPresentIds: ['p1'], rollCallAbsentIds: ['p2'] }), doc('s2', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [] }), doc('s3', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [] })] });
        expect(present(r, 's1')).toEqual(['p1']); expect(present(r, 's2')).toEqual(['p1', 'p2']); expect(present(r, 's3')).toEqual(['p1', 'p2']);
        expect(r.issues).toEqual([]);
    });
    it('a departure the page states for its own item outranks its per-decision roll call for that person', () => {
        // Argos ΔΣ 3/12/2025: ΠΑΡΟΝΤΕΣ lists four members that «κατά την λήψη της παρούσας απόφασης είχαν αποχωρήσει».
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ presentListMeaning: 'per_decision' }), mayorPersonId: null,
            events: [ev({ personId: 'p2', kind: 'DEPARTURE', anchorKind: 'SUBJECT', anchorSubjectId: 's2', timing: 'BEFORE', rawText: 'είχαν αποχωρήσει' })],
            documents: [doc('s1', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [] }), doc('s2', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [] })] });
        expect(present(r, 's2')).toEqual(['p1']);
        expect(r.issues).toEqual([]);
    });
    it('any other change a per-decision roll call contradicts is overridden and reported', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ presentListMeaning: 'per_decision' }), mayorPersonId: null,
            events: [ev({ personId: 'p2', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 2, timing: 'DURING', rawText: 'αποχώρησε κατά το 2ο θέμα' })],
            documents: [doc('s1', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [] }), doc('s2', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [] })] });
        expect(present(r, 's2')).toEqual(['p1', 'p2']);
        expect(r.issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's2', personId: 'p2',
            params: expect.objectContaining({ kind: 'statedList', status: 'PRESENT', eventKind: 'DEPARTURE' }) })]);
    });
    it('a person a per-decision page names under both headings is absent for that page\'s subject', () => {
        // Spec §4.1.12, as resolveRollCall seeds the opening roll call.
        const r = replayAttendance({ subjects, rollCall: [rc('a'), rc('b')], conventions: conv({ presentListMeaning: 'per_decision' }), mayorPersonId: null, events: [],
            documents: [doc('s1', { rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: [] }), doc('s2', { rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: ['b'] })] });
        expect(present(r, 's1')).toEqual(['a', 'b']);
        expect(present(r, 's2')).toEqual(['a']);
        expect(r.attendance.filter(x => x.subjectId === 's2' && x.personId === 'b')).toEqual([{ subjectId: 's2', personId: 'b', status: 'ABSENT', origin: 'derived' }]);
    });
    it('a subject without a document keeps the state of the last one read, under a per-decision roll call', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ presentListMeaning: 'per_decision' }), mayorPersonId: null, events: [],
            documents: [doc('s1', { rollCallPresentIds: ['p1'], rollCallAbsentIds: ['p2'] })] });
        expect(present(r, 's2')).toEqual(['p1']);
    });
    it('a per-decision roll call and a stated list on the same page are cross-checked, each direction its own code', () => {
        const conventions = conv({ presentListMeaning: 'per_decision', statesPerDecisionAttendance: true, rollCallLayout: 'present_only' });
        const dropped = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions, mayorPersonId: null, events: [],
            documents: [doc('s1', { rollCallPresentIds: ['p1', 'p2'], rollCallAbsentIds: [], presentIds: ['p1'] })] });
        expect(present(dropped, 's1')).toEqual(['p1']);                        // the list still wins for its subject
        expect(dropped.issues).toEqual([expect.objectContaining({ code: 'LIST_DROPS_PRESENT', subjectId: 's1', personId: 'p2' })]);

        // The list dropping a member the roll call has is the list knowing more,
        // and an `info`. The list adding one the roll call has absent is how a
        // misread ΑΠΟΧΩΡΗΣΑΝΤΕΣ column shows up, and a `warning`. Two severities
        // are two codes, because severity follows the code.
        const added = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions, mayorPersonId: null, events: [],
            documents: [doc('s1', { rollCallPresentIds: ['p1'], rollCallAbsentIds: ['p2'], presentIds: ['p1', 'p2'] })] });
        expect(present(added, 's1')).toEqual(['p1', 'p2']);
        expect(added.issues).toEqual([expect.objectContaining({ code: 'LIST_ADDS_ABSENT', subjectId: 's1', personId: 'p2' })]);
    });
    it('the two list codes speak for the page\'s roll call only about members it names', () => {
        // The page's ΠΑΡΟΝΤΕΣ names p1 alone; p2 is present from the opening roll
        // call. Saying «the document's roll call has this member present» of p2
        // would quote a statement the page never made.
        const conventions = conv({ presentListMeaning: 'per_decision', statesPerDecisionAttendance: true, rollCallLayout: 'present_only' });
        const implied = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions, mayorPersonId: null, events: [],
            documents: [doc('s1', { rollCallPresentIds: ['p1'], rollCallAbsentIds: [], presentIds: ['p1'] })] });
        expect(present(implied, 's1')).toEqual(['p1']);
        expect(implied.issues).toEqual([expect.objectContaining({ code: 'IMPLIED_CHANGE', subjectId: 's1', personId: 'p2' })]);

        const stated = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2', 'ABSENT')], conventions, mayorPersonId: null,
            events: [ev({ personId: 'p2', kind: 'ARRIVAL', anchorAgendaItemIndex: 1, timing: 'BEFORE', rawText: 'προσήλθε' })],
            documents: [doc('s1', { rollCallPresentIds: ['p1'], rollCallAbsentIds: [], presentIds: ['p1'] })] });
        expect(stated.issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's1', personId: 'p2',
            params: expect.objectContaining({ kind: 'statedList', eventKind: 'ARRIVAL', rawText: 'προσήλθε' }) })]);
    });
    it('a stated per-decision list wins, resets the state, and records the implied change', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2'), rc('p3')], conventions: conv({ statesPerDecisionAttendance: true }), mayorPersonId: null, events: [],
            documents: [doc('s2', { presentIds: ['p1', 'p2'], absentIds: ['p3'] })] });
        expect(present(r, 's1')).toEqual(['p1', 'p2', 'p3']);
        expect(present(r, 's2')).toEqual(['p1', 'p2']);
        expect(present(r, 's3')).toEqual(['p1', 'p2']);                       // reset carries forward
        expect(r.attendance.find(a => a.subjectId === 's2' && a.personId === 'p3')).toMatchObject({ status: 'ABSENT', origin: 'stated' });
        expect(r.issues).toEqual([expect.objectContaining({ code: 'IMPLIED_CHANGE', subjectId: 's2', personId: 'p3', decisionId: 'd-s2' })]);
    });
    it('a per-decision list that omits the mayor does not turn them absent', () => {
        // ΤΑ ΜΕΛΗ is the members' list: §3 says it leaves the mayor out, so their
        // absence from it states nothing and implies no change.
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('mayor')], conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }),
            mayorPersonId: 'mayor', events: [], documents: [doc('s2', { presentIds: ['p1'] })] });
        expect(r.issues).toEqual([]);
        expect(r.attendance.some(a => a.personId === 'mayor')).toBe(false);
    });
    it('a per-decision list that omits whoever presides does not turn them absent', () => {
        // ΤΑ ΜΕΛΗ lists the members; the president signs apart from it (Chalandri, Argos, Papagos ΔΣ: in the roll call, in no list).
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2'), rc('pres')], conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }),
            mayorPersonId: null, presidentPersonId: 'pres', events: [], documents: [doc('s2', { presentIds: ['p1'] })] });
        expect(present(r, 's2')).toEqual(['p1', 'pres']);                    // p2 is out by the list; the president is not judged by it
        expect(r.issues).toEqual([expect.objectContaining({ code: 'IMPLIED_CHANGE', personId: 'p2' })]);
    });
    it('the member a document says presided is exempt the same way, and a president absent from the start stays absent', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('vice'), rc('pres', 'ABSENT')], conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }),
            mayorPersonId: null, presidentPersonId: 'pres', events: [], documents: [doc('s2', { presentIds: ['p1'], presidedById: 'vice' })] });
        expect(present(r, 's2')).toEqual(['p1', 'vice']);
        expect(r.issues).toEqual([]);
    });
    it('where the list leaves the secretary out too, the secretary is not judged by it; elsewhere they are', () => {
        // Papagos ΔΣ 23/6/2026 item 8: roll call 25, ΤΑ ΜΕΛΗ 23, nobody stated absent — the two missing are the president and the secretary.
        const run = (secretaryPersonId: string | null) => replayAttendance({ subjects, rollCall: [rc('p1'), rc('sec'), rc('pres')],
            conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }), mayorPersonId: null, presidentPersonId: 'pres', secretaryPersonId,
            events: [], documents: [doc('s2', { presentIds: ['p1'] })] });
        expect(present(run('sec'), 's2')).toEqual(['p1', 'pres', 'sec']);
        expect(present(run(null), 's2')).toEqual(['p1', 'pres']);             // Argos ΔΣ lists its secretary: omitted there means gone
    });
    it('the member a document says kept the minutes is left out of the list the way the secretary is', () => {
        // Papagos ΔΣ 30/7/2026: «Η εκτελούσα χρέη Γραμματέα Αικατερίνη Γκούμα», the elected secretary away.
        const run = (secretaryPersonId: string | null) => replayAttendance({ subjects, rollCall: [rc('p1'), rc('acting'), rc('pres')],
            conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }), mayorPersonId: null, presidentPersonId: 'pres', secretaryPersonId,
            events: [], documents: [doc('s2', { presentIds: ['p1'], actingSecretaryId: 'acting' })] });
        expect(present(run('sec'), 's2')).toEqual(['acting', 'p1', 'pres']);
        expect(present(run(null), 's2')).toEqual(['p1', 'pres']);              // a body that writes its secretary in writes the acting one in too
    });
    it('a stated departure still takes the president out, list or no list', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('pres')], conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }),
            mayorPersonId: null, presidentPersonId: 'pres', events: [ev({ personId: 'pres', anchorAgendaItemIndex: 2, timing: 'BEFORE' })], documents: [doc('s2', { presentIds: ['p1'] })] });
        expect(present(r, 's2')).toEqual(['p1']);
    });
    it('a stated list that agrees with a stated event raises nothing', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ statesPerDecisionAttendance: true }), mayorPersonId: null,
            events: [ev({ personId: 'p2', anchorAgendaItemIndex: 2 })], documents: [doc('s2', { presentIds: ['p1'], absentIds: ['p2'] })] });
        expect(r.issues).toEqual([]);
    });
    it('a present-only list makes the members it omits absent', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ statesPerDecisionAttendance: true, rollCallLayout: 'present_only' }),
            mayorPersonId: null, events: [], documents: [doc('s2', { presentIds: ['p1'], absentIds: null })] });
        expect(present(r, 's1')).toEqual(['p1', 'p2']);
        expect(present(r, 's2')).toEqual(['p1']);
        expect(present(r, 's3')).toEqual(['p1']);                             // the reset carries forward
        expect(r.attendance.find(a => a.subjectId === 's2' && a.personId === 'p2')).toMatchObject({ status: 'ABSENT', origin: 'stated' });
        expect(r.issues).toEqual([expect.objectContaining({ code: 'IMPLIED_CHANGE', subjectId: 's2', personId: 'p2' })]);
    });
    it('a stated list that contradicts a stated event wins, and says so', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ statesPerDecisionAttendance: true }), mayorPersonId: null,
            events: [ev({ personId: 'p2', anchorAgendaItemIndex: 2, rawText: 'αποχώρησε ο κ. Β' })],
            documents: [doc('s2', { presentIds: ['p1', 'p2'], absentIds: [] })] });
        expect(present(r, 's2')).toEqual(['p1', 'p2']);
        expect(r.issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's2', personId: 'p2', decisionId: 'd-s2', rawText: 'αποχώρησε ο κ. Β' })]);
    });
    it('two roll-call rows that disagree resolve by source precedence and report it', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1', 'ABSENT', 'decision'), rc('p1', 'PRESENT', 'manual'), rc('p2'), rc('p2')],
            conventions: conv(), mayorPersonId: null, events: [], documents: [] });
        expect(present(r, 's1')).toEqual(['p1', 'p2']);
        expect(r.issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', personId: 'p1', source: 'manual' })]);
    });
    it('a person known only from an event still gets a row for every subject', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1')], conventions: conv(), mayorPersonId: null, documents: [],
            events: [ev({ personId: 'pX', kind: 'ARRIVAL', anchorAgendaItemIndex: 2 })] });
        for (const s of ['s1', 's2', 's3']) expect(r.attendance.filter(a => a.subjectId === s).map(a => a.personId).sort()).toEqual(['p1', 'pX']);
        expect(r.attendance.find(a => a.subjectId === 's1' && a.personId === 'pX')).toMatchObject({ status: 'ABSENT' });
        expect(present(r, 's2')).toEqual(['p1', 'pX']);
    });
    it('a cumulative present list puts a late arriver in the room at their arrival, not from the start', () => {
        const events = [ev({ personId: 'p2', kind: 'ARRIVAL', anchorAgendaItemIndex: 3 })];
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ presentListMeaning: 'cumulative' }), mayorPersonId: null, documents: [], events });
        expect(present(r, 's1')).toEqual(['p1']); expect(present(r, 's2')).toEqual(['p1']); expect(present(r, 's3')).toEqual(['p1', 'p2']);
        const opening = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv(), mayorPersonId: null, documents: [], events });
        expect(present(opening, 's1')).toEqual(['p1', 'p2']);                 // an opening list is taken as it stands
    });
    it('an arrival and a departure at the same point resolve by precedence and report it', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv(), mayorPersonId: null, documents: [], events: [
            ev({ id: 'a', personId: 'p1', anchorAgendaItemIndex: 2, rawText: 'αποχώρησε' }),
            ev({ id: 'b', personId: 'p1', kind: 'ARRIVAL', anchorAgendaItemIndex: 2, rawText: 'προσήλθε', source: 'manual' }),
        ] });
        expect(present(r, 's2')).toEqual(['p1', 'p2']);                       // manual wins
        expect(r.issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's2', personId: 'p1', source: 'manual' })]);
    });
    it('consecutive per-vote absences keep the member out: back after N and out before N+1 are two documents, not a contradiction', () => {
        // Orestiada ΔΣ 23/3/2026: items 3 and 4 each print «Κατά την διάρκεια της ψήφισης του θέματος απουσίαζαν…» naming the same member.
        const pair = (subjectId: string): EventRow[] => [
            ev({ id: `${subjectId}-out`, personId: 'p1', anchorKind: 'SUBJECT', anchorSubjectId: subjectId, timing: 'BEFORE' }),
            ev({ id: `${subjectId}-back`, personId: 'p1', kind: 'ARRIVAL', anchorKind: 'SUBJECT', anchorSubjectId: subjectId, timing: 'AFTER' })];
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv({ statesPerVoteAbsence: true }), mayorPersonId: null, documents: [],
            events: [...pair('s1'), ...pair('s2')] });
        expect(present(r, 's1')).toEqual(['p2']); expect(present(r, 's2')).toEqual(['p2']); expect(present(r, 's3')).toEqual(['p1', 'p2']);
        expect(r.issues).toEqual([]);
    });
    it('a return after N against a departure before N+1 from a meeting-wide statement is still a disagreement', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1'), rc('p2')], conventions: conv(), mayorPersonId: null, documents: [],
            events: [ev({ id: 'back', personId: 'p1', kind: 'ARRIVAL', anchorAgendaItemIndex: 1, timing: 'AFTER' }),
                ev({ id: 'out', personId: 'p1', anchorKind: 'SUBJECT', anchorSubjectId: 's2', timing: 'BEFORE' })] });
        expect(r.issues).toEqual([expect.objectContaining({ code: 'SOURCES_DISAGREE', subjectId: 's2', personId: 'p1' })]);
    });
    it('a departure at session end affects nothing', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1')], conventions: conv(), mayorPersonId: null, documents: [],
            events: [ev({ personId: 'p1', anchorKind: 'SESSION_END', timing: null })] });
        expect(present(r, 's1')).toEqual(['p1']); expect(present(r, 's2')).toEqual(['p1']); expect(present(r, 's3')).toEqual(['p1']);
        expect(r.issues).toEqual([]);
    });
    it('unknown present-list meaning is replayed as an opening roll call', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1')], conventions: conv({ presentListMeaning: 'unknown' }), mayorPersonId: null, events: [], documents: [] });
        expect(present(r, 's1')).toEqual(['p1']);
        expect(r.attendance.every(a => a.origin === 'derived')).toBe(true);
        expect(r.unknownSubjectIds).toEqual([]);
    });
    // The two meanings seed arrivals differently and agree on everything else, so
    // with no arrival stated the assumption cannot have changed a row.
    it('says nothing about an unsettled meaning when the meeting states no arrival', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1')], conventions: conv({ presentListMeaning: 'unknown' }), mayorPersonId: null, events: [], documents: [] });
        expect(r.issues).toEqual([]);
    });
    it('flags every subject once an arrival makes the meaning decide the answer', () => {
        const r = replayAttendance({ subjects, rollCall: [rc('p1')], conventions: conv({ presentListMeaning: 'unknown' }), mayorPersonId: null, documents: [],
            events: [ev({ personId: 'p2', kind: 'ARRIVAL', anchorAgendaItemIndex: 2, rawText: 'προσήλθε' })] });
        expect(r.issues.map(i => i.code)).toEqual(['PRESENCE_UNKNOWN', 'PRESENCE_UNKNOWN', 'PRESENCE_UNKNOWN']);
    });
    it('no roll call yields nothing and one NO_ROLL_CALL', () => {
        const r = replayAttendance({ subjects, rollCall: [], conventions: conv(), mayorPersonId: null, events: [], documents: [] });
        expect(r.attendance).toEqual([]); expect(r.issues).toEqual([expect.objectContaining({ code: 'NO_ROLL_CALL' })]);
    });
    it("does not judge the mayor by a committee's member list where the mayor is stated separately", () => {
        const out = replayAttendance({
            subjects: [subj('s1', 1)], rollCall: [rc('p1'), rc('mayor')], events: [],
            documents: [doc('s1', { presentIds: ['p1'] })],
            conventions: conv({ statesPerDecisionAttendance: true, mayorStatedSeparately: true }),
            mayorPersonId: null, cityMayorPersonId: 'mayor', presidentPersonId: null, secretaryPersonId: null,
        });
        expect(out.attendance.find(a => a.personId === 'mayor')).toMatchObject({ status: 'PRESENT' });
        expect(out.issues.filter(i => i.personId === 'mayor')).toEqual([]);
    });
});
