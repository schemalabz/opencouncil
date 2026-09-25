import { categorizeSubjectsForUpsert, type ExistingSubjectRow } from '../db/subject-helpers';
import { makeSubject } from '../../../tests/helpers/builders';

describe('categorizeSubjectsForUpsert', () => {
    it('matches incoming subject to existing by numeric agendaItemIndex', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        const existing = [{ id: 'db-1', agendaItemIndex: 1, name: 'Budget (old wording)' }];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-1' }]);
        expect(result.toCreate).toEqual([]);
    });

    it('always creates BEFORE_AGENDA subjects as new', () => {
        const incoming = [makeSubject({ name: 'Opening remarks', agendaItemIndex: 'BEFORE_AGENDA' })];
        const existing = [{ id: 'db-1', agendaItemIndex: 1, name: 'Budget (old wording)' }];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
    });

    it('always creates OUT_OF_AGENDA subjects as new', () => {
        const incoming = [makeSubject({ name: 'Misc discussion', agendaItemIndex: 'OUT_OF_AGENDA' })];
        const existing: ExistingSubjectRow[] = [];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
    });

    it('creates numeric subject when no existing match', () => {
        const incoming = [makeSubject({ name: 'New item', agendaItemIndex: 5 })];
        const existing = [{ id: 'db-1', agendaItemIndex: 1, name: 'Budget (old wording)' }];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
    });

    it('does not touch unmatched existing subjects', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        const existing = [
            { id: 'db-1', agendaItemIndex: 1, name: 'Budget (old wording)' },
            { id: 'db-2', agendaItemIndex: 2, name: 'Parks (old wording)' },
            { id: 'db-3', agendaItemIndex: 3, name: 'Roads (old wording)' },
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
            { id: 'db-1', agendaItemIndex: 1, name: 'Budget (old wording)' },
            { id: 'db-2', agendaItemIndex: 2, name: 'Parks (old wording)' },
            { id: 'db-3', agendaItemIndex: 3, name: 'Roads (old wording)' },
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
            { id: 'db-1', agendaItemIndex: 1, name: 'Budget (old wording)' },
            { id: 'db-null', agendaItemIndex: null, name: 'Something out of agenda' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-1' }]);
        // null-agendaItemIndex subjects can never be matched but are left untouched
        expect(result.toCreate).toEqual([]);
    });

    it('handles duplicate agendaItemIndex in existing (the lowest id wins)', () => {
        const incoming = [makeSubject({ name: 'Budget', agendaItemIndex: 1 })];
        const existing = [
            { id: 'db-1a', agendaItemIndex: 1, name: 'First duplicate' },
            { id: 'db-1b', agendaItemIndex: 1, name: 'Second duplicate' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        // A repeated slot resolves the same way every time: the row with the
        // lowest id takes it, the rest stay unmatched (issue 366).
        expect(result.toUpdate).toHaveLength(1);
        expect(result.toUpdate[0].existingId).toBe('db-1a');
    });

    it('keeps each id with its own subject when the agenda renumbers', () => {
        // θέμα 1 was withdrawn, so what was 2 and 3 is now 1 and 2. Matching
        // by index alone would give "Parks" the id the public knows as
        // "Budget" — a URL that used to open one subject would open another.
        const incoming = [
            makeSubject({ name: 'Parks maintenance', agendaItemIndex: 1 }),
            makeSubject({ name: 'Road repairs', agendaItemIndex: 2 }),
        ];
        const existing: ExistingSubjectRow[] = [
            { id: 'db-budget', agendaItemIndex: 1, name: 'Budget discussion' },
            { id: 'db-parks', agendaItemIndex: 2, name: 'Parks maintenance' },
            { id: 'db-roads', agendaItemIndex: 3, name: 'Road repairs' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([
            { incoming: incoming[0], existingId: 'db-parks' },
            { incoming: incoming[1], existingId: 'db-roads' },
        ]);
        expect(result.toCreate).toEqual([]);
        expect(result.unmatched.map((e) => e.id)).toEqual(['db-budget']);
    });

    it('falls back to the index when an item was reworded in place', () => {
        const incoming = [makeSubject({ name: 'Budget discussion (revised)', agendaItemIndex: 1 })];
        const existing: ExistingSubjectRow[] = [
            { id: 'db-budget', agendaItemIndex: 1, name: 'Budget discussion' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-budget' }]);
        expect(result.unmatched).toEqual([]);
    });

    it('matches names case- and whitespace-insensitively', () => {
        const incoming = [makeSubject({ name: '  ΈΓΚΡΙΣΗ   ΑΠΟΛΟΓΙΣΜΟΎ ', agendaItemIndex: 4 })];
        const existing: ExistingSubjectRow[] = [
            { id: 'db-x', agendaItemIndex: 2, name: 'Έγκριση απολογισμού' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-x' }]);
    });

    it('ignores a name that is ambiguous on either side and uses the index', () => {
        // Two existing rows share a name, so the name identifies nothing.
        const incoming = [makeSubject({ name: 'Έγκριση δαπάνης', agendaItemIndex: 2 })];
        const existing: ExistingSubjectRow[] = [
            { id: 'db-1', agendaItemIndex: 1, name: 'Έγκριση δαπάνης' },
            { id: 'db-2', agendaItemIndex: 2, name: 'Έγκριση δαπάνης' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-2' }]);
        expect(result.unmatched.map((e) => e.id)).toEqual(['db-1']);
    });

    it('never matches a non-agenda row, and never reports it as unmatched', () => {
        const incoming = [makeSubject({ name: 'Opening remarks', agendaItemIndex: 1 })];
        const existing: ExistingSubjectRow[] = [
            { id: 'db-open', agendaItemIndex: null, name: 'Opening remarks', nonAgendaReason: 'BEFORE_AGENDA' },
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        // The caller replaces non-agenda rows itself; leaving them out of
        // `unmatched` keeps a pruning caller from deleting them twice.
        expect(result.toUpdate).toEqual([]);
        expect(result.toCreate).toEqual([incoming[0]]);
        expect(result.unmatched).toEqual([]);
    });

    describe('pass 0: database id', () => {
        it('matches by id before the name, so a reworded subject keeps its row', () => {
            const incoming = [makeSubject({ id: 'db-2', name: 'Parks (reworded)', agendaItemIndex: 1 })];
            const existing = [
                { id: 'db-1', agendaItemIndex: 1, name: 'Roads' },
                { id: 'db-2', agendaItemIndex: 1, name: 'Parks' },
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-2' }]);
            expect(result.unmatched.map(e => e.id)).toEqual(['db-1']);
        });

        it('ignores an id that is not a row of this meeting and falls through to the name', () => {
            const incoming = [makeSubject({ id: 'a-hash-or-foreign-id', name: 'Roads', agendaItemIndex: 1 })];
            const existing = [{ id: 'db-1', agendaItemIndex: 1, name: 'Roads' }];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-1' }]);
        });

        it('vrilissia: three rows at index 1, reworded names, ids given — all three update, nothing is created', () => {
            const existing = [
                { id: 'r1', agendaItemIndex: 1, name: 'Τροποποίηση τεχνικού προγράμματος 2026' },
                { id: 'r2', agendaItemIndex: 1, name: 'Στρατηγικός σχεδιασμός καθαριότητας' },
                { id: 'r3', agendaItemIndex: 1, name: 'Ψήφισμα για ΙΔΟΧ προσωπικό' },
            ];
            const incoming = [
                makeSubject({ id: 'r1', name: 'Τροποποίηση τεχνικού προγράμματος 2026', agendaItemIndex: 1 }),
                makeSubject({ id: 'r2', name: 'Στρατηγικός σχεδιασμός καθαριότητας και ανακύκλωσης', agendaItemIndex: 1 }),
                makeSubject({ id: 'r3', name: 'Ψήφισμα για το προσωπικό ΙΔΟΧ', agendaItemIndex: 1 }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate.map(u => u.existingId)).toEqual(['r1', 'r2', 'r3']);
            expect(result.toCreate).toEqual([]);
            expect(result.unmatched).toEqual([]);
        });
    });

    it('does not let a non-agenda subject claim an agenda row by its name', () => {
        const existing = [{ id: 'db-7', agendaItemIndex: 5, name: 'Ανακοινώσεις' }];
        const incoming = [
            makeSubject({ name: 'Ανακοινώσεις Δημάρχου', agendaItemIndex: 5 }),
            makeSubject({ name: 'Ανακοινώσεις', agendaItemIndex: 'OUT_OF_AGENDA' }),
        ];

        const result = categorizeSubjectsForUpsert(incoming, existing);

        expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 'db-7' }]);
        expect(result.toCreate).toEqual([incoming[1]]);
    });

    describe('pass 2: (section, number)', () => {
        it('a sectioned meeting stays sectioned even when only a section-less row is left to match', () => {
            // The earlier passes claim both sectioned rows by name, so the only row
            // left is the section-less one summarize created. Reading the migration
            // flag off the leftovers would reopen the fallback and hand its id away.
            const existing = [
                { id: 'sec-1', agendaItemIndex: 1, agendaSectionIndex: 1, name: 'Έγκριση προϋπολογισμού' },
                { id: 'sec-2', agendaItemIndex: 1, agendaSectionIndex: 2, name: 'Άδεια κοινοχρήστου' },
                { id: 'sum-x', agendaItemIndex: 2, agendaSectionIndex: null, name: 'Συζήτηση για το γυμναστήριο' },
            ];
            const incoming = [
                makeSubject({ name: 'Έγκριση προϋπολογισμού', agendaItemIndex: 1, agendaSection: { index: 1, title: 'Α' } }),
                makeSubject({ name: 'Άδεια κοινοχρήστου', agendaItemIndex: 1, agendaSection: { index: 2, title: 'Β' } }),
                makeSubject({ name: 'Παραχώρηση οικοπέδου', agendaItemIndex: 2, agendaSection: { index: 2, title: 'Β' } }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toCreate).toEqual([incoming[2]]);
            expect(result.toUpdate.map(u => u.existingId)).toEqual(['sec-1', 'sec-2']);
            expect(result.unmatched.map(e => e.id)).toEqual(['sum-x']);
        });

        it('matches the pair when two sections reuse the same numbers', () => {
            const existing = [
                { id: 'g1', agendaItemIndex: 1, agendaSectionIndex: 1, name: 'Γλυπτό «Έφηβος»' },
                { id: 'm1', agendaItemIndex: 1, agendaSectionIndex: 2, name: 'Άδεια μουσικής «Παρέα»' },
            ];
            const incoming = [
                makeSubject({ name: 'Ανάκληση άδειας μουσικής', agendaItemIndex: 1, agendaSection: { index: 2, title: 'ΠΑΡΑΤΑΣΕΙΣ' } }),
                makeSubject({ name: 'Τοποθέτηση γλυπτού', agendaItemIndex: 1, agendaSection: { index: 1, title: 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ' } }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([
                { incoming: incoming[0], existingId: 'm1' },
                { incoming: incoming[1], existingId: 'g1' },
            ]);
        });

        it('athens first re-run: rows without a section match on the number alone', () => {
            const existing = [
                { id: 'old-1', agendaItemIndex: 1, name: 'Γλυπτό' },
                { id: 'old-2', agendaItemIndex: 2, name: 'Στέγη' },
            ];
            const incoming = [
                makeSubject({ name: 'Γλυπτό «Έφηβος» στον Άγιο Σώστη', agendaItemIndex: 1, agendaSection: { index: 1, title: 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ' } }),
                makeSubject({ name: 'Στρατηγική Στέγης', agendaItemIndex: 2, agendaSection: { index: 1, title: 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ' } }),
                makeSubject({ name: 'Άδεια μουσικής «Παρέα»', agendaItemIndex: 1, agendaSection: { index: 2, title: 'ΠΑΡΑΤΑΣΕΙΣ' } }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([
                { incoming: incoming[0], existingId: 'old-1' },
                { incoming: incoming[1], existingId: 'old-2' },
            ]);
            expect(result.toCreate).toEqual([incoming[2]]);
        });

        it('an incoming subject without a section matches a sectioned row on the number', () => {
            const existing = [{ id: 's1', agendaItemIndex: 3, agendaSectionIndex: 2, name: 'Καθαριότητα' }];
            const incoming = [makeSubject({ name: 'Καθαριότητα και ανακύκλωση', agendaItemIndex: 3 })];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([{ incoming: incoming[0], existingId: 's1' }]);
        });

        it('a repeated pair claims the row with the lowest id and leaves the rest unmatched', () => {
            const existing = [
                { id: 'b', agendaItemIndex: 1, agendaSectionIndex: null, name: 'Καρυές (δις)' },
                { id: 'a', agendaItemIndex: 1, agendaSectionIndex: null, name: 'Καρυές' },
            ];
            const incoming = [makeSubject({ name: 'Παραλαβή έργου Καρυών', agendaItemIndex: 1 })];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toHaveLength(1);
            expect(result.toUpdate[0].existingId).toBe('a');
            expect(result.unmatched).toHaveLength(1);
            expect(result.unmatched.map(e => e.id)).toEqual(['b']);
            expect(result.toCreate).toEqual([]);
        });

        it('two pre-migration rows at one number are claimed by the two sections that now hold it', () => {
            const existing = [
                { id: 'a', agendaItemIndex: 1, agendaSectionIndex: null, name: 'Γλυπτό' },
                { id: 'b', agendaItemIndex: 1, agendaSectionIndex: null, name: 'Παρέα' },
            ];
            const incoming = [
                makeSubject({ name: 'Τοποθέτηση γλυπτού «Έφηβος»', agendaItemIndex: 1, agendaSection: { index: 1, title: 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ' } }),
                makeSubject({ name: 'Ανάκληση άδειας μουσικής', agendaItemIndex: 1, agendaSection: { index: 2, title: 'ΠΑΡΑΤΑΣΕΙΣ' } }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([
                { incoming: incoming[0], existingId: 'a' },
                { incoming: incoming[1], existingId: 'b' },
            ]);
            expect(result.toCreate).toEqual([]);
            expect(result.unmatched).toEqual([]);
        });

        it('a numbered item does not take over a section-less row once any row carries a section', () => {
            // sum-x is a row summarize created: summarize never sends a section,
            // so a section-less row in a store that already has sections is not
            // a pre-migration row (issue 366).
            const existing = [
                { id: 'sec-1', agendaItemIndex: 1, agendaSectionIndex: 1, name: 'Γλυπτό' },
                { id: 'sec-2', agendaItemIndex: 1, agendaSectionIndex: 2, name: 'Παρέα' },
                { id: 'sum-x', agendaItemIndex: 2, agendaSectionIndex: null, name: 'Συζήτηση εκτός' },
            ];
            const incoming = [
                makeSubject({ name: 'Παράταση ωραρίου', agendaItemIndex: 2, agendaSection: { index: 2, title: 'ΠΑΡΑΤΑΣΕΙΣ' } }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([]);
            expect(result.toCreate).toEqual([incoming[0]]);
            expect(result.unmatched.map(e => e.id).sort()).toEqual(['sec-1', 'sec-2', 'sum-x']);
        });

        it('two sectioned rows at one number are claimed by two unsectioned incoming subjects', () => {
            const existing = [
                { id: 'a', agendaItemIndex: 1, agendaSectionIndex: 1, name: 'X' },
                { id: 'b', agendaItemIndex: 1, agendaSectionIndex: 2, name: 'Y' },
            ];
            const incoming = [
                makeSubject({ name: 'Τοποθέτηση γλυπτού «Έφηβος»', agendaItemIndex: 1 }),
                makeSubject({ name: 'Ανάκληση άδειας μουσικής', agendaItemIndex: 1 }),
            ];

            const result = categorizeSubjectsForUpsert(incoming, existing);

            expect(result.toUpdate).toEqual([
                { incoming: incoming[0], existingId: 'a' },
                { incoming: incoming[1], existingId: 'b' },
            ]);
            expect(result.toCreate).toEqual([]);
            expect(result.unmatched).toEqual([]);
        });
    });
});
