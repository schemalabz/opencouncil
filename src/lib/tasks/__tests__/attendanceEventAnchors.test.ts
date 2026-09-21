/**
 * The anchor column is a NOT NULL enum, and the events of a meeting are written
 * in one createMany inside a transaction: a kind that maps to undefined threw,
 * rolled the delete back with it, and left the meeting on its previous events
 * with nothing raised. So what an unknown kind does is the contract here.
 */
import { anchorKindOf } from '@/lib/tasks/attendanceEventAnchors';
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
