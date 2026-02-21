import { categorizeSubjectsForUpsert } from '../db/subject-helpers';
import { Subject } from '../apiTypes';

function makeSubject(overrides: Partial<Subject> & { name: string; agendaItemIndex: Subject['agendaItemIndex'] }): Subject {
    return {
        description: 'desc',
        introducedByPersonId: null,
        speakerContributions: [],
        topicImportance: 'normal',
        proximityImportance: 'none',
        location: null,
        topicLabel: null,
        context: null,
        ...overrides,
    };
}

describe('categorizeSubjectsForUpsert', () => {
    it('matches incoming subject to existing by numeric agendaItemIndex', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        const existing = [{ id: 'db-1', agendaItemIndex: 1 }];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-1' }]);
        expect(result.toCreate).toEqual([]);
    });

    it('always creates BEFORE_AGENDA subjects as new', () => {
        const incoming = [makeSubject({ name: 'Opening remarks', agendaItemIndex: 'BEFORE_AGENDA' })];
        const existing = [{ id: 'db-1', agendaItemIndex: 1 }];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
    });

    it('always creates OUT_OF_AGENDA subjects as new', () => {
        const incoming = [makeSubject({ name: 'Misc discussion', agendaItemIndex: 'OUT_OF_AGENDA' })];
        const existing: { id: string; agendaItemIndex: number | null }[] = [];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
    });

    it('creates numeric subject when no existing match', () => {
        const incoming = [makeSubject({ name: 'New item', agendaItemIndex: 5 })];
        const existing = [{ id: 'db-1', agendaItemIndex: 1 }];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
    });

    it('does not touch unmatched existing subjects', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        const existing = [
            { id: 'db-1', agendaItemIndex: 1 },
            { id: 'db-2', agendaItemIndex: 2 },
            { id: 'db-3', agendaItemIndex: 3 },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toHaveLength(1);
        // db-2 and db-3 are NOT in toUpdate or toCreate — they're left untouched
        expect(result.toCreate).toEqual([]);
    });

    it('handles mixed scenario: some match, some new, some untouched', () => {
        const incoming = [
            makeSubject({ name: 'Updated item 1', agendaItemIndex: 1 }),
            makeSubject({ name: 'Updated item 3', agendaItemIndex: 3 }),
            makeSubject({ name: 'New item', agendaItemIndex: 5 }),
            makeSubject({ name: 'Before agenda', agendaItemIndex: 'BEFORE_AGENDA' }),
        ];
        const existing = [
            { id: 'db-1', agendaItemIndex: 1 },
            { id: 'db-2', agendaItemIndex: 2 },
            { id: 'db-3', agendaItemIndex: 3 },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([
            { incoming: incoming[0], existingId: 'db-1' },
            { incoming: incoming[1], existingId: 'db-3' },
        ]);
        expect(result.toCreate).toEqual([incoming[2], incoming[3]]);
        // db-2 is unmatched but NOT deleted — it stays in the database
    });

    it('returns all empty arrays when both inputs are empty', () => {
        const result = categorizeSubjectsForUpsert([], []);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([]);
    });

    it('leaves existing subjects with null agendaItemIndex untouched', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        const existing = [
            { id: 'db-1', agendaItemIndex: 1 },
            { id: 'db-null', agendaItemIndex: null },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-1' }]);
        // null-agendaItemIndex subjects can never be matched but are left untouched
        expect(result.toCreate).toEqual([]);
    });

    it('handles duplicate agendaItemIndex in existing (last wins in map)', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        // Shouldn't happen in practice, but the Map will keep the last entry
        const existing = [
            { id: 'db-1a', agendaItemIndex: 1 },
            { id: 'db-1b', agendaItemIndex: 1 },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        // Map overwrites, so last existing with agendaItemIndex=1 wins
        expect(result.toUpdate).toHaveLength(1);
        expect(result.toUpdate[0].existingId).toBe('db-1b');
    });
});
