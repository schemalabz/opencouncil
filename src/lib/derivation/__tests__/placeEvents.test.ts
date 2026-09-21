import { placeEvents, decisionOrdinal } from '../placeEvents';
import type { EventRow, OrderedSubject } from '../types';

const subj = (id: string, idx: number | null, reason: 'beforeAgenda' | 'outOfAgenda' | null = null, decisionNumber: string | null = null): OrderedSubject =>
    ({ id, name: id, agendaItemIndex: idx, nonAgendaReason: reason, decisionNumber });
const ev = (o: Partial<EventRow>): EventRow => ({
    id: 'e', personId: 'p1', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: null, anchorNonAgendaReason: null,
    anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: null, rawText: '',
    reportingDocuments: 1, totalDocuments: 1, source: 'decision', ...o,
});
// discussed order: OA1, #1, #2, #3 — an out-of-agenda subject carries no agendaItemIndex.
const order = [subj('oa1', null, 'outOfAgenda'), subj('s1', 1, null, '284/2026'), subj('s2', 2, null, '286/2026'), subj('s3', 3, null, '304/2026')];

describe('decisionOrdinal', () => {
    it('reads the first digit run', () => { expect(decisionOrdinal('286/2026')).toBe(286); expect(decisionOrdinal(null)).toBeNull(); });
});

describe('placeEvents', () => {
    it('agenda item during → that subject; after → the next', () => {
        const { placed } = placeEvents(order, [
            ev({ id: 'a', anchorAgendaItemIndex: 2, timing: 'DURING' }),
            ev({ id: 'b', anchorAgendaItemIndex: 2, timing: 'AFTER' }),
            ev({ id: 'c', anchorAgendaItemIndex: 2, timing: 'BEFORE' }),
        ]);
        expect(placed.map(p => [p.event.id, p.effectAt])).toEqual([['a', 2], ['b', 3], ['c', 2]]);
    });
    it('out-of-agenda item matches the N-th out-of-agenda subject, which carries no agendaItemIndex', () => {
        const { placed, issues } = placeEvents(order, [ev({ anchorAgendaItemIndex: 1, anchorNonAgendaReason: 'outOfAgenda', timing: 'DURING' })]);
        expect(issues).toEqual([]);
        expect(placed[0].effectAt).toBe(0);
    });
    it('out-of-agenda anchors count the out-of-agenda subjects in order', () => {
        const twoOA = [subj('oa1', null, 'outOfAgenda'), subj('s1', 1), subj('oa2', null, 'outOfAgenda')];
        const { placed, issues } = placeEvents(twoOA, [
            ev({ id: 'a', anchorAgendaItemIndex: 2, anchorNonAgendaReason: 'outOfAgenda', timing: 'DURING' }),
            ev({ id: 'b', anchorAgendaItemIndex: 3, anchorNonAgendaReason: 'outOfAgenda', timing: 'DURING' }),
        ]);
        expect(placed.map(p => [p.event.id, p.effectAt])).toEqual([['a', 2]]);
        expect(issues[0]).toMatchObject({ code: 'UNPLACEABLE_ANCHOR' });
    });
    it('an agenda anchor with no agenda item is unplaceable, not the first index-less subject', () => {
        const { placed, issues } = placeEvents([subj('pre', null, 'beforeAgenda'), subj('s1', 1)], [ev({ anchorAgendaItemIndex: null, timing: 'DURING' })]);
        expect(placed).toEqual([]);
        expect(issues[0]).toMatchObject({ code: 'UNPLACEABLE_ANCHOR', params: { reason: 'noAgendaItem' } });
    });
    it('decision number lands on the first subject that reaches it', () => {
        const { placed } = placeEvents(order, [
            ev({ id: 'd', anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '286', timing: 'DURING' }),
            ev({ id: 'e', anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '286', timing: 'AFTER' }),
            ev({ id: 'f', anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '290', timing: 'DURING' }),
        ]);
        expect(placed.map(p => [p.event.id, p.effectAt])).toEqual([['d', 2], ['e', 3], ['f', 3]]);
    });
    it('after the last printed decision is after the last subject, not unplaceable', () => {
        const { placed, issues } = placeEvents(order, [
            ev({ id: 'd', anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '304', timing: 'AFTER' }),
            ev({ id: 'e', anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '400', timing: 'AFTER' }),
        ]);
        expect(placed.map(p => [p.event.id, p.effectAt])).toEqual([['d', 4], ['e', 4]]);
        expect(issues).toEqual([]);
    });
    it('a decision number no subject reaches is still unplaceable when the event happens during it', () => {
        const { placed, issues } = placeEvents(order, [ev({ anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '400', timing: 'DURING' })]);
        expect(placed).toEqual([]);
        expect(issues[0]).toMatchObject({ code: 'UNPLACEABLE_ANCHOR' });
    });
    it('subject anchor is the agenda anchor of that subject', () => {
        const { placed } = placeEvents(order, [ev({ anchorKind: 'SUBJECT', anchorSubjectId: 's3', timing: 'BEFORE' }), ev({ id: 'g', anchorKind: 'SUBJECT', anchorSubjectId: 's3', timing: 'AFTER' })]);
        expect(placed.map(p => p.effectAt)).toEqual([3, 4]);
    });
    it('phases resolve to block starts', () => {
        const { placed, issues } = placeEvents(order, [
            ev({ id: 'p', anchorKind: 'PHASE', anchorPhase: 'PRE_AGENDA' }),
            ev({ id: 'q', anchorKind: 'PHASE', anchorPhase: 'OUT_OF_AGENDA' }),
        ]);
        expect(placed.map(p => [p.event.id, p.effectAt])).toEqual([['p', 0], ['q', 0]]);
        expect(issues).toEqual([]);
    });
    it('an out-of-agenda phase with no such subject is unplaceable', () => {
        const { placed, issues } = placeEvents([subj('s1', 1)], [ev({ anchorKind: 'PHASE', anchorPhase: 'OUT_OF_AGENDA', rawText: 'κατά τα εκτός' })]);
        expect(placed).toEqual([]);
        expect(issues[0]).toMatchObject({ code: 'UNPLACEABLE_ANCHOR', personId: 'p1', rawText: 'κατά τα εκτός' });
    });
    it('session start and end', () => {
        const { placed } = placeEvents(order, [ev({ anchorKind: 'SESSION_START', kind: 'ARRIVAL' }), ev({ id: 'z', anchorKind: 'SESSION_END', kind: 'DEPARTURE' })]);
        expect(placed.map(p => p.effectAt)).toEqual([0, 4]);
    });
    it('an agenda index that exists nowhere is unplaceable', () => {
        const { placed, issues } = placeEvents(order, [ev({ anchorAgendaItemIndex: 9, timing: 'DURING' })]);
        expect(placed).toEqual([]); expect(issues[0].code).toBe('UNPLACEABLE_ANCHOR');
    });
});
