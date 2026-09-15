import {
    buildAttention,
    estimateWork,
    filterCandidatesByNumber,
    splitTableRows,
    type AttentionSubject,
    type CandidateView,
} from '../attention';

function candidate(over: Partial<CandidateView>): CandidateView {
    return {
        id: 'c1',
        ada: 'ΑΔΑ1',
        title: null,
        pdfUrl: 'https://diavgeia.gov.gr/doc/ΑΔΑ1',
        publishDate: null,
        meetingDate: null,
        decisionNumber: null,
        readStatus: 'ok',
        subjectId: null,
        confidence: null,
        reasoning: null,
        conflict: null,
        ...over,
    };
}

function subject(over: Partial<AttentionSubject> & { id: string }): AttentionSubject {
    return {
        name: `Θέμα ${over.id}`,
        agendaItemIndex: null,
        agendaItemTitle: null,
        nonAgendaReason: null,
        withdrawn: false,
        ...over,
    };
}

describe('buildAttention', () => {
    const subjects = [
        subject({ id: 's9', agendaItemIndex: 9 }),
        subject({ id: 's10', agendaItemIndex: 10 }),
        subject({ id: 's37', agendaItemIndex: 37 }),
        subject({ id: 's16', agendaItemIndex: 16, withdrawn: true }),
    ];

    it('puts every candidate in exactly one list', () => {
        const attention = buildAttention(subjects, { s37: {} }, [
            candidate({ id: 'p', subjectId: 's9', confidence: 0.8 }),
            candidate({ id: 'k', ada: 'ΑΔΑ2', conflict: { subjectId: 's37', subjectName: 'Θέμα s37' }, subjectId: 's10' }),
            candidate({ id: 'u', ada: 'ΑΔΑ3' }),
        ]);
        expect(attention.proposals.map(p => p.candidate.id)).toEqual(['p']);
        expect(attention.conflicts.map(c => c.candidate.id)).toEqual(['k']);
        expect(attention.unplaced.map(u => u.candidate.id)).toEqual(['u']);
        expect(attention.total).toBe(3);
    });

    it('reads confidence as a yes/no hint only above the threshold', () => {
        const attention = buildAttention(subjects, {}, [
            candidate({ id: 'sure', subjectId: 's9', confidence: 0.6 }),
            candidate({ id: 'unsure', ada: 'ΑΔΑ2', subjectId: 's10', confidence: 0.59 }),
        ]);
        expect(attention.proposals.find(p => p.candidate.id === 'sure')?.likelyMatch).toBe(true);
        expect(attention.proposals.find(p => p.candidate.id === 'unsure')?.likelyMatch).toBe(false);
    });

    it('demotes a suggestion to unplaced when its subject is taken, withdrawn, or already proposed', () => {
        const attention = buildAttention(subjects, { s37: {} }, [
            candidate({ id: 'taken', subjectId: 's37' }),
            candidate({ id: 'withdrawn', ada: 'ΑΔΑ2', subjectId: 's16' }),
            candidate({ id: 'first', ada: 'ΑΔΑ3', subjectId: 's9' }),
            candidate({ id: 'second', ada: 'ΑΔΑ4', subjectId: 's9' }),
            candidate({ id: 'elsewhere', ada: 'ΑΔΑ5', subjectId: 'not-in-meeting' }),
        ]);
        expect(attention.proposals.map(p => p.candidate.id)).toEqual(['first']);
        expect(attention.unplaced.map(u => u.candidate.id)).toEqual(['taken', 'withdrawn', 'second', 'elsewhere']);
    });

    it('leaves the backfill rows the resolver has not read to the next poll', () => {
        const attention = buildAttention(subjects, {}, [
            candidate({ id: 'unreadProposal', subjectId: 's9', readStatus: 'unread' }),
            candidate({ id: 'unreadLoose', ada: 'ΑΔΑ2', readStatus: 'unread' }),
            candidate({ id: 'unreadClaim', ada: 'ΑΔΑ3', readStatus: 'unread', conflict: { subjectId: 's37', subjectName: 'Θέμα s37' }, subjectId: 's10' }),
        ]);
        expect(attention.proposals).toEqual([]);
        expect(attention.unplaced).toEqual([]);
        // A contested document is a person's question whatever its read state.
        expect(attention.conflicts.map(c => c.candidate.id)).toEqual(['unreadClaim']);
        expect(attention.total).toBe(1);
    });

    it('resolves the holder and the claimant of a conflict to meeting subjects when it can', () => {
        const attention = buildAttention(subjects, { s37: {} }, [
            candidate({ id: 'k', conflict: { subjectId: 's37', subjectName: 'Ονοματοδοσία' }, subjectId: 's10' }),
            candidate({ id: 'far', ada: 'ΑΔΑ2', conflict: { subjectId: 'other-meeting', subjectName: 'Αλλού' }, subjectId: null }),
        ]);
        const [near, far] = attention.conflicts;
        expect(near.holder?.id).toBe('s37');
        expect(near.claimant?.id).toBe('s10');
        expect(far.holder).toBeNull();
        expect(far.holderName).toBe('Αλλού');
        expect(far.claimant).toBeNull();
    });

    it('offers no move to a claimant that already holds its own decision', () => {
        const attention = buildAttention(subjects, { s37: {}, s10: {} }, [
            candidate({ id: 'stale', conflict: { subjectId: 's37', subjectName: 'Θέμα s37' }, subjectId: 's10' }),
        ]);
        expect(attention.conflicts[0].holder?.id).toBe('s37');
        expect(attention.conflicts[0].claimant).toBeNull();
    });
});

describe('estimateWork', () => {
    it('says under a minute for a couple of quick answers', () => {
        expect(estimateWork({ proposals: [{} as never, {} as never], conflicts: [], unplaced: [] })).toEqual({ kind: 'underMinute' });
    });

    it('rounds the total up to whole minutes', () => {
        const items = { proposals: [{} as never], conflicts: [{} as never], unplaced: [{} as never, {} as never, {} as never] };
        // 20 + 40 + 120 = 180 seconds
        expect(estimateWork(items)).toEqual({ kind: 'minutes', minutes: 3 });
        expect(estimateWork({ ...items, proposals: [{} as never, {} as never] })).toEqual({ kind: 'minutes', minutes: 4 });
    });
});

describe('filterCandidatesByNumber', () => {
    const pool = [
        candidate({ id: 'a', decisionNumber: '545/2026' }),
        candidate({ id: 'b', ada: 'ΨΞ4ΡΩ6Μ-Τ5Κ', decisionNumber: '54' }),
        candidate({ id: 'c', ada: '6ΥΙ2Ω6Μ-8ΓΞ', decisionNumber: '1545' }),
        candidate({ id: 'd', ada: 'ΑΔΑ4', decisionNumber: null, title: 'Έγκριση πρακτικών της συνεδρίασης' }),
    ];

    it('matches the digits a decision number starts with, sorted by number', () => {
        expect(filterCandidatesByNumber(pool, '54').map(c => c.id)).toEqual(['b', 'a']);
        expect(filterCandidatesByNumber(pool, '545').map(c => c.id)).toEqual(['a']);
    });

    it('falls back to the ADA and the title for a non-numeric query, accents aside', () => {
        expect(filterCandidatesByNumber(pool, 'ψξ4ρ').map(c => c.id)).toEqual(['b']);
        expect(filterCandidatesByNumber(pool, 'εγκριση πρακτικων').map(c => c.id)).toEqual(['d']);
    });

    it('lists the whole pool, lowest number first, for an empty query', () => {
        expect(filterCandidatesByNumber(pool, '  ').map(c => c.id)).toEqual(['b', 'a', 'c', 'd']);
    });
});

describe('splitTableRows', () => {
    const rows = [1, 2, 3, 4, 5];

    it('folds the tail once the limit is exceeded', () => {
        expect(splitTableRows(rows, { limit: 3, expanded: false, searching: false })).toEqual({ visible: [1, 2, 3], hidden: [4, 5] });
    });

    it('shows everything when expanded, searching, or short', () => {
        expect(splitTableRows(rows, { limit: 3, expanded: true, searching: false }).hidden).toEqual([]);
        expect(splitTableRows(rows, { limit: 3, expanded: false, searching: true }).hidden).toEqual([]);
        expect(splitTableRows([1, 2], { limit: 3, expanded: false, searching: false }).hidden).toEqual([]);
    });
});
