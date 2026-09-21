const mockReadDerivationRows = jest.fn();
const mockReplaceDerivedRows = jest.fn();
jest.mock('@/lib/db/derivationFacts', () => ({
    readDerivationRows: (...a: unknown[]) => mockReadDerivationRows(...a),
    replaceDerivedRows: (...a: unknown[]) => mockReplaceDerivedRows(...a),
}));

import { derivationSkipIssue, hasNothingToDeriveFrom, deriveAndPersist } from '../persist';
import type { DerivationInput, DocumentFacts } from '../types';

const doc = (subjectId: string, hasExtraction: boolean): DocumentFacts => ({
    subjectId, decisionId: `d-${subjectId}`, voteResultPhrase: 'Ομόφωνα', namedVotes: [], tally: null,
    presentIds: null, absentIds: null, unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null, mayorPresent: null,
    presidedById: null, presidedByName: null, hasExtraction,
});

const input = (overrides: Partial<DerivationInput> = {}): DerivationInput => ({
    cityId: 'c', meetingId: 'm', mayorPersonId: null,
    subjects: [
        { id: 's1', name: 'one', agendaItemIndex: 1, nonAgendaReason: null, decisionNumber: '10' },
        { id: 's2', name: 'two', agendaItemIndex: 2, nonAgendaReason: null, decisionNumber: '11' },
    ],
    rollCall: [{ personId: 'p1', status: 'PRESENT', source: 'decision' }],
    events: [],
    documents: [doc('s1', true), doc('s2', true)],
    conventions: null,
    ...overrides,
});

describe('derivationSkipIssue', () => {
    it('derives when every document carries stored facts and a roll call exists', () => {
        expect(derivationSkipIssue(input())).toBeNull();
        expect(hasNothingToDeriveFrom(input())).toBe(false);
    });

    it('refuses the write when one document of a mixed meeting lacks stored facts', () => {
        // The incremental poll: one newly published document is extracted while
        // the rest were read before facts were stored.
        const skip = derivationSkipIssue(input({ documents: [doc('s1', false), doc('s2', true)] }));
        expect(skip).toMatchObject({ code: 'NO_STORED_FACTS', severity: 'error' });
        expect(skip!.params).toEqual({ missing: 1, total: 2 });
    });

    it('refuses the write when no document carries stored facts', () => {
        expect(derivationSkipIssue(input({ documents: [doc('s1', false), doc('s2', false)] })))
            .toMatchObject({ code: 'NO_STORED_FACTS' });
    });

    it('refuses the write when the roll call is empty', () => {
        expect(derivationSkipIssue(input({ rollCall: [] }))).toMatchObject({ code: 'NO_ROLL_CALL', severity: 'error' });
    });

    it('refuses a meeting with no documents and no roll call', () => {
        expect(derivationSkipIssue(input({ documents: [], rollCall: [] }))).toMatchObject({ code: 'NO_ROLL_CALL' });
    });
});

describe('deriveAndPersist', () => {
    const rows = (over: Partial<DerivationInput> = {}) => {
        const i = input(over);
        mockReadDerivationRows.mockResolvedValue({
            meeting: {
                dateTime: new Date('2026-01-01'),
                administrativeBody: { decisionConventions: null },
                subjects: i.subjects.map(s => ({
                    id: s.id, name: s.name, agendaItemIndex: s.agendaItemIndex, nonAgendaReason: s.nonAgendaReason,
                    withdrawn: false, discussedIn: null,
                    decision: {
                        id: `d-${s.id}`, subjectId: s.id, decisionNumber: s.decisionNumber, voteResultPhrase: 'Ομόφωνα',
                        unmatchedNames: [], incomplete: false, mayorPresent: null,
                        extraction: i.documents.find(d => d.subjectId === s.id)?.hasExtraction ? {} : null,
                    },
                })),
            },
            firstUtteranceBySubject: new Map<string, number>(),
            rollCall: i.rollCall,
            events: i.events,
            people: [{ id: 'p1', roles: [] }],
        });
    };

    beforeEach(() => {
        mockReadDerivationRows.mockReset();
        mockReplaceDerivedRows.mockReset();
    });

    it('writes nothing when a document of the meeting lacks stored facts', async () => {
        rows({ documents: [doc('s1', false), doc('s2', true)] });
        const out = await deriveAndPersist('c', 'm');
        expect(mockReplaceDerivedRows).not.toHaveBeenCalled();
        expect(out.attendance).toEqual([]);
        expect(out.issues.map(i => i.code)).toEqual(['NO_STORED_FACTS']);
    });

    it('writes nothing when the roll call is empty', async () => {
        rows({ rollCall: [] });
        const out = await deriveAndPersist('c', 'm');
        expect(mockReplaceDerivedRows).not.toHaveBeenCalled();
        expect(out.issues.map(i => i.code)).toEqual(['NO_ROLL_CALL']);
    });

    it('writes the derived rows when the input is complete', async () => {
        rows();
        await deriveAndPersist('c', 'm', 'task-1');
        expect(mockReplaceDerivedRows).toHaveBeenCalledTimes(1);
        const [subjectIds, attendance, votes, taskId] = mockReplaceDerivedRows.mock.calls[0];
        expect(subjectIds).toEqual(['s1', 's2']);
        expect(attendance.length).toBeGreaterThan(0);
        expect(votes.length).toBeGreaterThan(0);
        expect(taskId).toBe('task-1');
    });
});
