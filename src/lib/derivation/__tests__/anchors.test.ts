/**
 * The anchor column is a NOT NULL enum, and the events of a meeting are written
 * in one createMany inside a transaction: a kind that maps to undefined threw,
 * rolled the delete back with it, and left the meeting on its previous events
 * with nothing raised. So what an unknown kind does is the contract here.
 */
import { anchorKindOf, statedChangeOf } from '@/lib/derivation/anchors';
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
