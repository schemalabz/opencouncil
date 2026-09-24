import { categorizeSubjects, getNonAgendaLabel, getWithdrawnLabel, getSubjectCategories, pickSummarySubjects, agendaItemTitleOrName, isRecordSubject, recordSection, sectionHeadingAt } from '@/lib/utils/subjects';

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
    it('returns the withdrawn key for IN_AGENDA withdrawn (short)', () => {
        expect(getWithdrawnLabel(t, { nonAgendaReason: null })).toBe('withdrawnShort');
    });

    it('returns the not-approved key for OUT_OF_AGENDA withdrawn (short)', () => {
        expect(getWithdrawnLabel(t, { nonAgendaReason: 'outOfAgenda' })).toBe('notApprovedShort');
    });

    it('returns long label for IN_AGENDA withdrawn', () => {
        expect(getWithdrawnLabel(t, { nonAgendaReason: null }, 'long')).toBe('withdrawnLong');
    });

    it('returns long label for OUT_OF_AGENDA withdrawn', () => {
        expect(getWithdrawnLabel(t, { nonAgendaReason: 'outOfAgenda' }, 'long')).toBe('notApprovedLong');
    });
});

describe('pickSummarySubjects', () => {
    const subject = (id: string, contributions: number) => ({ id, name: id, _count: { contributions } });

    it('keeps the most discussed subjects, most discussed first', () => {
        const picked = pickSummarySubjects([subject('a', 1), subject('b', 5), subject('c', 3)], 2);
        expect(picked.map(s => s.id)).toEqual(['b', 'c']);
    });

    it('returns every subject when the cap is not reached', () => {
        expect(pickSummarySubjects([subject('a', 0)], 6).map(s => s.id)).toEqual(['a']);
    });
});

describe('agendaItemTitleOrName', () => {
    it('prefers the verbatim agenda item title', () => {
        expect(agendaItemTitleOrName({
            name: 'Αποζημίωση ακινήτου Κόκκινο Μετόχι',
            agendaItemTitle: 'ΕΓΚΡΙΣΗ ΕΝΑΡΞΗΣ ΔΙΑΔΙΚΑΣΙΩΝ ΠΛΗΡΩΜΗΣ ΑΠΟΖΗΜΙΩΣΗΣ ΑΚΙΝΗΤΟΥ',
        })).toBe('ΕΓΚΡΙΣΗ ΕΝΑΡΞΗΣ ΔΙΑΔΙΚΑΣΙΩΝ ΠΛΗΡΩΜΗΣ ΑΠΟΖΗΜΙΩΣΗΣ ΑΚΙΝΗΤΟΥ');
    });

    it('falls back to the summary name when no title is stored', () => {
        expect(agendaItemTitleOrName({ name: 'Αποζημίωση ακινήτου Κόκκινο Μετόχι', agendaItemTitle: null }))
            .toBe('Αποζημίωση ακινήτου Κόκκινο Μετόχι');
    });

    it('falls back to the summary name for an empty title', () => {
        expect(agendaItemTitleOrName({ name: 'Περίληψη', agendaItemTitle: '' })).toBe('Περίληψη');
    });

    it('falls back to the summary name for a whitespace-only title', () => {
        expect(agendaItemTitleOrName({ name: 'Περίληψη', agendaItemTitle: '   ' })).toBe('Περίληψη');
    });
});

describe('isRecordSubject', () => {
    it('belongs when the subject has an agenda position', () => {
        expect(isRecordSubject({ agendaItemIndex: 5, nonAgendaReason: null })).toBe(true);
    });

    it('belongs when the agenda position is item 0', () => {
        expect(isRecordSubject({ agendaItemIndex: 0, nonAgendaReason: null })).toBe(true);
    });

    it('belongs when it was taken up out of the agenda', () => {
        expect(isRecordSubject({ agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' })).toBe(true);
    });

    it('never belongs to a beforeAgenda subject, even one carrying an agenda index', () => {
        expect(isRecordSubject({ agendaItemIndex: 7, nonAgendaReason: 'beforeAgenda' })).toBe(false);
    });

    it('does not belong when it has neither an agenda position nor an out-of-agenda reason', () => {
        expect(isRecordSubject({ agendaItemIndex: null, nonAgendaReason: null })).toBe(false);
    });
});

describe('recordSection', () => {
    it('reads the register from nonAgendaReason, not from the index', () => {
        // The agenda PDF can leave an index on a subject taken up out of the agenda.
        // Bucketing on the index files it as a regular agenda item.
        expect(recordSection({ nonAgendaReason: 'outOfAgenda' })).toBe('outOfAgenda');
        expect(recordSection({ nonAgendaReason: null })).toBe('agenda');
    });

    it('reads outOfAgenda specifically, not "carries any non-agenda reason"', () => {
        // isRecordSubject keeps beforeAgenda out of the record, so this pairing
        // should not reach a list — but the two rules live in different
        // functions, and only one of them is what this one must not lean on.
        expect(recordSection({ nonAgendaReason: 'beforeAgenda' })).toBe('agenda');
    });
});

describe('sectionHeadingAt', () => {
    const agenda = { nonAgendaReason: null };
    const ooa = { nonAgendaReason: 'outOfAgenda' };

    /** The heading each row opens, for a whole list — what the reader actually sees. */
    const headings = (section: Array<{ nonAgendaReason: string | null }>) =>
        section.map((_, i) => sectionHeadingAt(section, i));

    it('labels both blocks, in the order the page lists them', () => {
        expect(headings([ooa, ooa, agenda, agenda])).toEqual(['outOfAgenda', null, 'agenda', null]);
    });

    it('labels both blocks in the opposite order too', () => {
        expect(headings([agenda, agenda, ooa])).toEqual(['agenda', null, 'outOfAgenda']);
    });

    it('opens exactly one heading per block, never one per row', () => {
        expect(headings([ooa, ooa, ooa]).filter(Boolean)).toEqual(['outOfAgenda']);
    });

    it('labels a single-block list once', () => {
        expect(headings([agenda])).toEqual(['agenda']);
    });

    it('returns null past the end of the list', () => {
        expect(sectionHeadingAt([agenda], 1)).toBeNull();
    });
});
