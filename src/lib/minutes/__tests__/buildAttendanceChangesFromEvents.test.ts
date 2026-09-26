import { buildAttendanceChangesFromEvents, buildMayorNote } from '../builders';
import type { PlaceableEvent } from '@/lib/derivation/placeEvents';
import { MinutesMember } from '../types';

const member = (personId: string, name: string): MinutesMember => ({ personId, name, party: null, isPartyHead: false, role: null });
const subject = (subjectId: string, agendaItemIndex: number, decisionNumber: string | null, present: string[] = [], absent: string[] = []) => ({
    subjectId, name: `Θέμα ${agendaItemIndex}`, agendaItemIndex, nonAgendaReason: null as null,
    attendance: { present: present.map(p => member(p, p)), absent: absent.map(p => member(p, p)) },
    decisionNumber,
});
const event = (over: Partial<PlaceableEvent>): PlaceableEvent => ({
    personId: 'vera', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: null, anchorNonAgendaReason: null,
    anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: null, rawText: 'αποχώρησε', ...over,
});
const resolve = (id: string) => member(id, id);

describe('buildAttendanceChangesFromEvents', () => {
    const subjects = [subject('a', 19, '284'), subject('b', 22, null), subject('c', 23, '286'), subject('d', 2, '304')];

    it('places a decision-number departure on the first subject whose decision reaches it', () => {
        const { changes: [c] } = buildAttendanceChangesFromEvents([event({ anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '286', timing: 'DURING' })], subjects, resolve, null);
        expect(c.atSubject.id).toBe('c');
        expect(c.anchorLabel).toBe('στην 286 ΑΚΣ');
    });

    it('"after" a decision number lands on the next decision', () => {
        const { changes: [c] } = buildAttendanceChangesFromEvents([event({ anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '286', timing: 'AFTER' })], subjects, resolve, null);
        expect(c.atSubject.id).toBe('d');
    });

    it('labels a decision number by where the change takes effect: «μετά την» only when timed after', () => {
        const label = (timing: PlaceableEvent['timing'], kind: PlaceableEvent['kind'] = 'DEPARTURE') => buildAttendanceChangesFromEvents(
            [event({ kind, anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '286', timing })], subjects, resolve, null).changes[0].anchorLabel;
        expect(label('AFTER', 'ARRIVAL')).toBe('μετά την 286 ΑΚΣ');
        expect(label('AFTER')).toBe('μετά την 286 ΑΚΣ');
        expect(label('BEFORE')).toBe('στην 286 ΑΚΣ');
        expect(label(null)).toBe('στην 286 ΑΚΣ');
    });

    it('an agenda-item anchor lands on that item, or the next one when timed after', () => {
        const { changes: during } = buildAttendanceChangesFromEvents([event({ anchorAgendaItemIndex: 22, timing: 'BEFORE' })], subjects, resolve, null);
        const { changes: after } = buildAttendanceChangesFromEvents([event({ anchorAgendaItemIndex: 22, timing: 'AFTER' })], subjects, resolve, null);
        expect(during[0].atSubject.id).toBe('b');
        expect(after[0].atSubject.id).toBe('c');
        expect(during[0].anchorLabel).toBeNull();
    });

    it('a subject anchor lands on that subject, after on the next', () => {
        const { changes: during } = buildAttendanceChangesFromEvents([event({ anchorKind: 'SUBJECT', anchorSubjectId: 'b', timing: 'BEFORE' })], subjects, resolve, null);
        const { changes: after } = buildAttendanceChangesFromEvents([event({ kind: 'ARRIVAL', anchorKind: 'SUBJECT', anchorSubjectId: 'b', timing: 'AFTER' })], subjects, resolve, null);
        expect(during[0].atSubject.id).toBe('b');
        expect(after[0].atSubject.id).toBe('c');
    });

    it('a phase lands on the start of its block and prints the phase', () => {
        const { changes: [pre] } = buildAttendanceChangesFromEvents([event({ kind: 'ARRIVAL', anchorKind: 'PHASE', anchorPhase: 'PRE_AGENDA' })], subjects, resolve, null);
        expect(pre.atSubject.id).toBe(subjects[0].subjectId);
        expect(pre.anchorLabel).toBe('πριν την ημερήσια διάταξη');
    });

    it('carries the sentence the document states the change in', () => {
        const { changes: [c] } = buildAttendanceChangesFromEvents(
            [event({ anchorAgendaItemIndex: 22, timing: 'BEFORE', rawText: 'Η κ. Βέρα αποχώρησε μετά το 22ο θέμα' })], subjects, resolve, null);
        expect(c.rawText).toBe('Η κ. Βέρα αποχώρησε μετά το 22ο θέμα');
    });

    it("keeps the mayor's own movement out of the list and labels it for the ΔΗΜΑΡΧΟΣ line", () => {
        const { changes, mayorChanges } = buildAttendanceChangesFromEvents([
            event({ personId: 'mayor', anchorAgendaItemIndex: 22, timing: 'AFTER' }),
            event({ anchorAgendaItemIndex: 22, timing: 'AFTER' }),
        ], subjects, resolve, 'mayor');
        expect(changes.map(c => c.personId)).toEqual(['vera']);
        expect(mayorChanges).toEqual([{ type: 'departure', label: 'από το 23ο θέμα' }]);
        // The label goes straight after the verb on the ΔΗΜΑΡΧΟΣ line, so it has
        // to be a position phrase and not a bare «23ο θέμα».
        expect(buildMayorNote('PRESENT', mayorChanges, true)).toBe('αποχώρησε από το 23ο θέμα');
    });

    // The placement is placeEvents', so the sentence and the attendance table it
    // prints beside cannot disagree. Both cases below used to differ by one item.
    it('places «after a decision number» on the subject after the one that reaches it', () => {
        const byDecision = [subject('a', 1, '286'), subject('b', 2, null), subject('c', 3, '287')];
        const { changes: [c] } = buildAttendanceChangesFromEvents(
            [event({ anchorKind: 'DECISION_NUMBER', anchorDecisionNumber: '286', timing: 'AFTER' })], byDecision, resolve, null);
        expect(c.atSubject.id).toBe('b');
    });

    it('prints nothing for a change past the last subject', () => {
        const { changes, mayorChanges } = buildAttendanceChangesFromEvents([
            event({ anchorAgendaItemIndex: 2, timing: 'AFTER' }),
            event({ personId: 'mayor', anchorAgendaItemIndex: 2, timing: 'AFTER' }),
        ], subjects, resolve, 'mayor');
        expect(changes).toEqual([]);
        expect(mayorChanges).toEqual([]);
    });

    it('session-start arrivals and session-end departures are not changes', () => {
        expect(buildAttendanceChangesFromEvents([event({ kind: 'ARRIVAL', anchorKind: 'SESSION_START' }), event({ anchorKind: 'SESSION_END' })], subjects, resolve, null).changes).toEqual([]);
    });
});
