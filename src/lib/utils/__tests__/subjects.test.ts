import { categorizeSubjects, getNonAgendaLabel, SUBJECT_CATEGORIES, filterSubjectsForMinutes } from '../subjects';

function makeSubject(overrides: Partial<{
    id: string;
    name: string;
    nonAgendaReason: string | null;
    agendaItemIndex: number | null;
    statistics: { speakingSeconds: number };
}> = {}) {
    return {
        id: 'subject-1',
        name: 'Test subject',
        nonAgendaReason: null as string | null,
        agendaItemIndex: null as number | null,
        statistics: { speakingSeconds: 0 },
        speakerSegments: [],
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

    it('sorts beforeAgenda and outOfAgenda by speaking time (descending)', () => {
        const subjects = [
            makeSubject({ name: 'Low', nonAgendaReason: 'beforeAgenda', statistics: { speakingSeconds: 10 } }),
            makeSubject({ name: 'High', nonAgendaReason: 'beforeAgenda', statistics: { speakingSeconds: 100 } }),
            makeSubject({ name: 'Mid', nonAgendaReason: 'beforeAgenda', statistics: { speakingSeconds: 50 } }),
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
    it('returns short label for beforeAgenda', () => {
        expect(getNonAgendaLabel('beforeAgenda')).toBe('Προ ημερησίας');
    });

    it('returns short label for outOfAgenda', () => {
        expect(getNonAgendaLabel('outOfAgenda')).toBe('Εκτός ημερησίας');
    });
});

describe('SUBJECT_CATEGORIES', () => {
    it('has all three categories defined', () => {
        expect(SUBJECT_CATEGORIES).toHaveProperty('beforeAgenda');
        expect(SUBJECT_CATEGORIES).toHaveProperty('outOfAgenda');
        expect(SUBJECT_CATEGORIES).toHaveProperty('agenda');
    });

    it('each category has label, shortLabel, and explainerText', () => {
        for (const category of Object.values(SUBJECT_CATEGORIES)) {
            expect(category.label).toBeTruthy();
            expect(category.shortLabel).toBeTruthy();
            expect(category.explainerText).toBeTruthy();
        }
    });
});

describe('filterSubjectsForMinutes', () => {
    it('keeps agenda items', () => {
        const subjects = [
            makeSubject({ id: 's1', agendaItemIndex: 1 }),
            makeSubject({ id: 's2', agendaItemIndex: 2 }),
        ];
        expect(filterSubjectsForMinutes(subjects).map(s => s.id)).toEqual(['s1', 's2']);
    });

    it('keeps outOfAgenda subjects', () => {
        const subjects = [
            makeSubject({ id: 's1', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' }),
        ];
        expect(filterSubjectsForMinutes(subjects)).toHaveLength(1);
    });

    it('excludes beforeAgenda subjects', () => {
        const subjects = [
            makeSubject({ id: 's1', agendaItemIndex: null, nonAgendaReason: 'beforeAgenda' }),
        ];
        expect(filterSubjectsForMinutes(subjects)).toHaveLength(0);
    });

    it('excludes subjects with no agendaItemIndex and no nonAgendaReason', () => {
        const subjects = [
            makeSubject({ id: 's1' }),
        ];
        expect(filterSubjectsForMinutes(subjects)).toHaveLength(0);
    });

    it('handles mixed subjects correctly', () => {
        const subjects = [
            makeSubject({ id: 'agenda-1', agendaItemIndex: 1 }),
            makeSubject({ id: 'before', agendaItemIndex: null, nonAgendaReason: 'beforeAgenda' }),
            makeSubject({ id: 'out', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' }),
            makeSubject({ id: 'agenda-2', agendaItemIndex: 3 }),
            makeSubject({ id: 'orphan' }),
        ];
        expect(filterSubjectsForMinutes(subjects).map(s => s.id)).toEqual(['agenda-1', 'out', 'agenda-2']);
    });

    it('returns empty array for empty input', () => {
        expect(filterSubjectsForMinutes([])).toEqual([]);
    });

    // agendaItemIndex is always 1-indexed in practice, so 0 never occurs.
    // This test documents the current behavior; if 0-indexing is ever needed,
    // the filter should use `s.agendaItemIndex !== null` instead of truthiness.
    it('treats agendaItemIndex 0 as falsy (excluded unless outOfAgenda)', () => {
        const subjects = [
            makeSubject({ id: 'zero', agendaItemIndex: 0 }),
        ];
        // Currently excluded because 0 is falsy — this is a known limitation
        expect(filterSubjectsForMinutes(subjects)).toHaveLength(0);
    });
});
