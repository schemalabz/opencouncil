/**
 * The anchor column is a NOT NULL enum, and the events of a meeting are written
 * in one createMany inside a transaction: a kind that maps to undefined threw,
 * rolled the delete back with it, and left the meeting on its previous events
 * with nothing raised. So what an unknown kind does is the contract here.
 */
import { anchorKindOf, outForOwnVote, pageStatementsOf, perVoteAbsenceOf, rangeCoversDecision, statedChangeOf } from '@/lib/derivation/anchors';
import type { PollDecisionsAttendanceEvent } from '@/lib/apiTypes';

const event = (kind: string, type: 'arrival' | 'departure' = 'departure'): PollDecisionsAttendanceEvent => ({
    personId: 'p1', name: 'Α. Β.', type,
    anchor: { kind: kind as PollDecisionsAttendanceEvent['anchor']['kind'], agendaItemIndex: null, nonAgendaReason: null, decisionNumber: null, phase: null, timing: null },
    rawText: 'αποχώρησε', reportingPdfCount: 1, totalPdfCount: 1,
});

describe('anchorKindOf', () => {
    it.each([
        ['agenda_item', 'AGENDA_ITEM'], ['decision_number', 'DECISION_NUMBER'], ['subject', 'SUBJECT'], ['phase', 'PHASE'],
        ['session_start', 'SESSION_START'], ['session_end', 'SESSION_END'],
        // task version 3 vocabulary
        ['this_document', 'SUBJECT'], ['session_phase', 'PHASE'],
    ])('%s → %s', (kind, want) => {
        expect(anchorKindOf(event(kind))).toBe(want);
    });

    it('reads a legacy clock time as the boundary it is nearest, not as subject 0', () => {
        expect(anchorKindOf(event('clock_time', 'arrival'))).toBe('SESSION_START');
        expect(anchorKindOf(event('clock_time', 'departure'))).toBe('SESSION_END');
    });

    it('is null for a kind it does not know, so the caller can skip that one event', () => {
        expect(anchorKindOf(event('roll_call'))).toBeNull();
    });
});

describe('statedChangeOf', () => {
    const wire = (o: Record<string, unknown> = {}, anchor: Record<string, unknown> = {}) => ({
        personId: 'p1', name: 'Α. Β.', type: 'departure', rawText: 'αποχώρησε μετά το 3ο θέμα', reportingPdfCount: 1, totalPdfCount: 1,
        anchor: { kind: 'agenda_item', agendaItemIndex: 3, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: 'after', ...anchor },
        ...o,
    });

    it('reads a stored wire change into the stored enums', () => {
        expect(statedChangeOf(wire())).toEqual({
            personId: 'p1', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 3, anchorNonAgendaReason: null,
            anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'AFTER', rawText: 'αποχώρησε μετά το 3ο θέμα',
        });
    });

    it('keeps the page own subject and the out-of-agenda phase', () => {
        expect(statedChangeOf(wire({ type: 'arrival' }, { kind: 'subject', subjectId: 's9', timing: 'after' }))).toMatchObject({ kind: 'ARRIVAL', anchorKind: 'SUBJECT', anchorSubjectId: 's9' });
        expect(statedChangeOf(wire({}, { kind: 'phase', agendaItemIndex: null, phase: 'out_of_agenda', timing: null }))).toMatchObject({ anchorKind: 'PHASE', anchorPhase: 'OUT_OF_AGENDA', timing: null });
    });

    it('is null for a change with no person, an unknown kind, or no shape at all', () => {
        expect(statedChangeOf(wire({ personId: null }))).toBeNull();
        expect(statedChangeOf(wire({}, { kind: 'roll_call' }))).toBeNull();
        expect(statedChangeOf('αποχώρησε')).toBeNull();
    });
});

describe('per-vote absences', () => {
    const rawText = 'Κατά τη διαδικασία της ψηφοφορίας απουσίαζε ο Α. Β.';
    const anchor = (o: Record<string, unknown> = {}) => ({ kind: 'this_document', agendaItemIndex: null, nonAgendaReason: null, decisionNumber: null, decisionNumberTo: null, phase: null, timing: null, ...o });
    const absent = (o: Record<string, unknown> = {}, a: Record<string, unknown> = {}) => ({ personId: 'p1', name: 'Α. Β.', type: 'absent_for_vote', rawText, reportingPdfCount: 1, totalPdfCount: 1, anchor: anchor(a), ...o });
    // What the task stored before `absent_for_vote` reached the wire: one sentence as a pair on the page's own subject.
    const expandedPair = (personId = 'p1', text = rawText) => [
        { personId, name: 'Α. Β.', type: 'departure', rawText: text, reportingPdfCount: 1, totalPdfCount: 1, anchor: anchor({ kind: 'subject', subjectId: 's3', timing: 'before' }) },
        { personId, name: 'Α. Β.', type: 'arrival', rawText: text, reportingPdfCount: 1, totalPdfCount: 1, anchor: anchor({ kind: 'subject', subjectId: 's3', timing: 'after' }) },
    ];
    const own = { personId: 'p1', decisionNumberFrom: null, decisionNumberTo: null, rawText };

    it('reads an absence from this decision, whatever anchor other than a decision number it carries, and none', () => {
        expect(perVoteAbsenceOf(absent())).toEqual(own);
        expect(perVoteAbsenceOf(absent({}, { kind: 'subject', subjectId: 's3' }))).toEqual(own);
        expect(perVoteAbsenceOf(absent({ anchor: undefined }))).toEqual(own);
    });

    it('reads a range of decisions as stated, and one number as a range of one; timing plays no part', () => {
        expect(perVoteAbsenceOf(absent({}, { kind: 'decision_number', decisionNumber: '31', decisionNumberTo: '40' })))
            .toEqual({ ...own, decisionNumberFrom: '31', decisionNumberTo: '40' });
        expect(perVoteAbsenceOf(absent({}, { kind: 'decision_number', decisionNumber: '31', timing: 'during' })))
            .toEqual({ ...own, decisionNumberFrom: '31', decisionNumberTo: '31' });
    });

    it('is null for an arrival, a departure or no person', () => {
        expect(perVoteAbsenceOf(absent({ type: 'departure' }))).toBeNull();
        expect(perVoteAbsenceOf(absent({ personId: null }))).toBeNull();
        expect(statedChangeOf(absent())).toBeNull();
    });

    it('reads the expanded pair of an older reading as the same absence as the new entry', () => {
        expect(pageStatementsOf(expandedPair())).toEqual({ statedChanges: [], perVoteAbsences: [own] });
        expect(pageStatementsOf([absent()])).toEqual(pageStatementsOf(expandedPair()));
    });

    it('keeps a departure and an arrival that are not one expanded pair as stated changes', () => {
        const [out, back] = expandedPair();
        const otherText = { ...back, rawText: 'επανήλθε' };
        expect(pageStatementsOf([out, otherText])).toMatchObject({ statedChanges: [{ kind: 'DEPARTURE' }, { kind: 'ARRIVAL' }], perVoteAbsences: [] });
        expect(pageStatementsOf([out])).toMatchObject({ statedChanges: [{ kind: 'DEPARTURE', anchorKind: 'SUBJECT' }], perVoteAbsences: [] });
        expect(pageStatementsOf([...expandedPair('p1'), ...expandedPair('p2')]).perVoteAbsences.map(a => a.personId)).toEqual(['p1', 'p2']);
    });

    it('a range covers the decisions from its first to its last, by the number the clerk counts', () => {
        const range = { ...own, decisionNumberFrom: '31', decisionNumberTo: '40' };
        expect(['30/2026', '31/2026', '35/2026', '40/2026', '41/2026', null].map(n => rangeCoversDecision(range, n))).toEqual([false, true, true, true, false, false]);
        expect(rangeCoversDecision(own, '31/2026')).toBe(false);
    });

    it('names who a page states out for its own decision', () => {
        const range = { ...own, personId: 'p2', decisionNumberFrom: '31', decisionNumberTo: '40' };
        const hadLeft = statedChangeOf({ ...expandedPair('p3')[0], timing: 'before' })!;
        const leftAfter = { ...hadLeft, personId: 'p4', timing: 'AFTER' as const };
        const page = { statedChanges: [hadLeft, leftAfter], perVoteAbsences: [own, range] };
        expect([...outForOwnVote(page, '35/2026')].sort()).toEqual(['p1', 'p2', 'p3']);
        expect([...outForOwnVote(page, '42/2026')].sort()).toEqual(['p1', 'p3']);
    });
});
