import { measureMeeting } from '../measure';
import type { DerivationInput, DerivationOutput, DocumentFacts } from '../types';

const doc = (subjectId: string, o: Partial<DocumentFacts> = {}): DocumentFacts => ({
    subjectId, decisionId: 'd-' + subjectId, voteResultPhrase: null, namedVotes: [], tally: null, presentIds: null, absentIds: null,
    rollCallPresentIds: null, rollCallAbsentIds: null, lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] },
    unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null,
    mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null, hasExtraction: true, ...o,
});
const input = (o: Partial<DerivationInput> = {}): DerivationInput => ({
    cityId: 'c', meetingId: 'm', subjectIdsWithStoredVotes: [], conventions: null, presidentPersonId: null, secretaryPersonId: null,
    mayorPersonId: null, bodyType: 'council', cityMayorPersonId: 'mayor',
    subjects: [1, 2, 3].map(i => ({ id: `s${i}`, name: `s${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: null })),
    rollCall: [{ personId: 'p1', status: 'PRESENT', source: 'decision' }, { personId: 'mayor', status: 'PRESENT', source: 'decision' }],
    events: [], documents: [doc('s1'), doc('s2'), doc('s3')], ...o,
});
const output = (o: Partial<DerivationOutput> = {}): DerivationOutput => ({ attendance: [], votes: [], issues: [], phraseOnlySubjectIds: [], ...o });

describe('measureMeeting', () => {
    it('flags the mayor in the rows of a council (check 1) and an absence nothing stated (check 2)', () => {
        const attendance = ['s1', 's2', 's3'].flatMap(subjectId => [
            { subjectId, personId: 'p1', status: 'PRESENT' as const, origin: 'derived' as const },
            { subjectId, personId: 'mayor', status: 'ABSENT' as const, origin: 'stated' as const },
        ]);
        const m = measureMeeting('c/m', input(), output({ attendance }), null);
        expect(m.checks.mayorRowsOffBody).toBe(3);
        expect(m.checks.unstatedAbsences).toEqual([{ personId: 'mayor', absentOn: 3, of: 3 }]);
    });

    it('ranks the roll call as the replay does: a manual ABSENT outranks the pages\' PRESENT (checks 2 and 3)', () => {
        const attendance = ['s1', 's2', 's3'].map(subjectId => ({ subjectId, personId: 'p1', status: 'ABSENT' as const, origin: 'derived' as const }));
        const rollCall = [{ personId: 'p1', status: 'PRESENT' as const, source: 'decision' as const }, { personId: 'mayor', status: 'PRESENT' as const, source: 'decision' as const }];
        const manual = [{ personId: 'p1', status: 'ABSENT' as const, source: 'manual' as const }, { personId: 'mayor', status: 'ABSENT' as const, source: 'manual' as const }];
        const m = measureMeeting('c/m', input({ rollCall: [...rollCall, ...manual], documents: [doc('s1', { presentIds: ['p1'] })] }), output({ attendance }), null);
        expect(m.checks.unstatedAbsences).toEqual([]);
        expect(m.checks.listOmitsMayor).toBe(0);
    });

    it('does not flag the mayor on a committee', () => {
        const attendance = [{ subjectId: 's1', personId: 'mayor', status: 'PRESENT' as const, origin: 'derived' as const }];
        expect(measureMeeting('c/m', input({ bodyType: 'committee' }), output({ attendance }), null).checks.mayorRowsOffBody).toBe(0);
    });

    it('counts a vote row for a member absent on that subject (check 5)', () => {
        const m = measureMeeting('c/m', input(), output({
            attendance: [{ subjectId: 's1', personId: 'p1', status: 'ABSENT', origin: 'derived' }],
            votes: [{ subjectId: 's1', personId: 'p1', voteType: 'FOR', origin: 'inferred' }],
        }), null);
        expect(m.checks.votesWhileAbsent).toBe(1);
    });

    it('finds two roll-call names that share one id (check 7) and one person in both lists (check 9)', () => {
        const m = measureMeeting('c/m', input({ documents: [
            doc('s1', { lists: { rollCallPresent: ['Α', 'Β', 'Γ'], rollCallAbsent: [], decisionPresent: [] }, rollCallPresentIds: ['p1', 'p2'] }),
            doc('s2', { lists: { rollCallPresent: ['Α'], rollCallAbsent: ['Α'], decisionPresent: [] }, rollCallPresentIds: ['p1'], rollCallAbsentIds: ['p1'] }),
        ] }), output(), null);
        expect(m.checks.namesCollapsed).toEqual([{ decisionId: 'd-s1', names: 3, ids: 2, unmatched: 0 }]);
        expect(m.checks.inBothLists).toEqual([{ decisionId: 'd-s2', personId: 'p1' }]);
    });

    it('does not count an unmatched name as collapsed', () => {
        const m = measureMeeting('c/m', input({ documents: [
            doc('s1', { lists: { rollCallPresent: ['Α', 'Β'], rollCallAbsent: [], decisionPresent: [] }, rollCallPresentIds: ['p1'], unmatchedNames: ['Β'] }),
        ] }), output(), null);
        expect(m.checks.namesCollapsed).toEqual([]);
    });

    it('hashes the rows so two runs compare, and records a refusal', () => {
        const a = measureMeeting('c/m', input(), output({ attendance: [{ subjectId: 's1', personId: 'p1', status: 'PRESENT', origin: 'derived' }] }), null);
        const b = measureMeeting('c/m', input(), output({ attendance: [{ subjectId: 's1', personId: 'p1', status: 'ABSENT', origin: 'derived' }] }), null);
        expect(a.hash).not.toBe(b.hash);
        expect(measureMeeting('c/m', input(), null, 'NO_ROLL_CALL')).toMatchObject({ refused: 'NO_ROLL_CALL', hash: '' });
    });
});
