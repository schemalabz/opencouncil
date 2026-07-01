import { categorizeSubjects, getNonAgendaLabel, getWithdrawnLabel, getSubjectCategories } from '../subjects';

// Identity translator: returns the key so tests assert the resolved key path
// without depending on message-file contents.
const t = (key: string) => key;

function makeSubject(overrides: Partial<{
    id: string;
    name: string;
    nonAgendaReason: string | null;
    agendaItemIndex: number | null;
    withdrawn: boolean;
    statistics: { speakingSeconds: number };
    _count: { contributions: number };
}> = {}) {
    return {
        id: 'subject-1',
        name: 'Test subject',
        nonAgendaReason: null as string | null,
        agendaItemIndex: null as number | null,
        withdrawn: false,
        statistics: { speakingSeconds: 0 },
        speakerSegments: [],
        _count: { contributions: 0 },
        ...overrides,
    };
}

describe('categorizeSubjects', () => {
    it('separates subjects into three categories', () => {
        const subjects = [
            makeSubject({ name: 'Before 1', nonAgendaReason: 'beforeAgenda' }),
            makeSubject({ name: 'Agenda 1', agendaItemIndex: 1 }),
            makeSubject({ name: 'Out 1', nonAgendaReason: 'outOfAgenda' }),
            makeSubject({ name: 'Agenda 2', agendaItemIndex: 2 }),
            makeSubject({ name: 'Before 2', nonAgendaReason: 'beforeAgenda' }),
        ];

        const result = categorizeSubjects(subjects);

        expect(result.beforeAgenda.map(s => s.name)).toEqual(['Before 1', 'Before 2']);
        expect(result.outOfAgenda.map(s => s.name)).toEqual(['Out 1']);
        expect(result.agenda.map(s => s.name)).toEqual(['Agenda 1', 'Agenda 2']);
    });

    it('returns empty arrays when no subjects match a category', () => {
        const subjects = [
            makeSubject({ name: 'Agenda only', agendaItemIndex: 1 }),
        ];

        const result = categorizeSubjects(subjects);

        expect(result.beforeAgenda).toEqual([]);
        expect(result.outOfAgenda).toEqual([]);
        expect(result.agenda).toHaveLength(1);
    });

    it('sorts beforeAgenda and outOfAgenda by speaker contribution count (descending)', () => {
        const subjects = [
            makeSubject({ name: 'Low', nonAgendaReason: 'beforeAgenda', _count: { contributions: 1 } }),
            makeSubject({ name: 'High', nonAgendaReason: 'beforeAgenda', _count: { contributions: 10 } }),
            makeSubject({ name: 'Mid', nonAgendaReason: 'beforeAgenda', _count: { contributions: 5 } }),
        ];

        const result = categorizeSubjects(subjects);

        expect(result.beforeAgenda.map(s => s.name)).toEqual(['High', 'Mid', 'Low']);
    });

    it('does not sort agenda subjects (consumer decides)', () => {
        const subjects = [
            makeSubject({ name: 'Third', agendaItemIndex: 3 }),
            makeSubject({ name: 'First', agendaItemIndex: 1 }),
            makeSubject({ name: 'Second', agendaItemIndex: 2 }),
        ];

        const result = categorizeSubjects(subjects);

        // Preserves input order — no sorting applied
        expect(result.agenda.map(s => s.name)).toEqual(['Third', 'First', 'Second']);
    });

    it('excludes subjects that have both nonAgendaReason and agendaItemIndex', () => {
        const subjects = [
            makeSubject({ name: 'Weird', nonAgendaReason: 'beforeAgenda', agendaItemIndex: 5 }),
        ];

        const result = categorizeSubjects(subjects);

        // Has agendaItemIndex, so it goes to agenda (not beforeAgenda)
        expect(result.beforeAgenda).toEqual([]);
        expect(result.agenda).toHaveLength(1);
    });

    it('handles empty input', () => {
        const result = categorizeSubjects([]);

        expect(result.beforeAgenda).toEqual([]);
        expect(result.outOfAgenda).toEqual([]);
        expect(result.agenda).toEqual([]);
    });
});

describe('getNonAgendaLabel', () => {
    it('resolves the shortLabel key for beforeAgenda', () => {
        expect(getNonAgendaLabel(t, 'beforeAgenda')).toBe('categories.beforeAgenda.shortLabel');
    });

    it('resolves the shortLabel key for outOfAgenda', () => {
        expect(getNonAgendaLabel(t, 'outOfAgenda')).toBe('categories.outOfAgenda.shortLabel');
    });
});

describe('getSubjectCategories', () => {
    it('has all three categories defined', () => {
        const categories = getSubjectCategories(t);
        expect(categories).toHaveProperty('beforeAgenda');
        expect(categories).toHaveProperty('outOfAgenda');
        expect(categories).toHaveProperty('agenda');
    });

    it('each category resolves label, shortLabel, and explainerText via the translator', () => {
        const categories = getSubjectCategories(t);
        for (const category of Object.values(categories)) {
            expect(category.label).toBeTruthy();
            expect(category.shortLabel).toBeTruthy();
            expect(category.explainerText).toBeTruthy();
        }
    });
});

describe('getWithdrawnLabel', () => {
    it('returns "Αποσύρθηκε" for IN_AGENDA withdrawn (short)', () => {
        expect(getWithdrawnLabel({ nonAgendaReason: null })).toBe('Αποσύρθηκε');
    });

    it('returns "Δεν εγκρίθηκε" for OUT_OF_AGENDA withdrawn (short)', () => {
        expect(getWithdrawnLabel({ nonAgendaReason: 'outOfAgenda' })).toBe('Δεν εγκρίθηκε');
    });

    it('returns long label for IN_AGENDA withdrawn', () => {
        expect(getWithdrawnLabel({ nonAgendaReason: null }, 'long')).toBe('Το θέμα αποσύρθηκε και δεν συζητήθηκε.');
    });

    it('returns long label for OUT_OF_AGENDA withdrawn', () => {
        expect(getWithdrawnLabel({ nonAgendaReason: 'outOfAgenda' }, 'long')).toBe('Το θέμα δεν εγκρίθηκε ως έκτακτο.');
    });
});
