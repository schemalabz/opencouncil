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
    tally: null, presentIds: null, absentIds: null, unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null, mayorPresent: null, presidedById: null, presidedByName: null, hasExtraction: true, ...o });
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
});
