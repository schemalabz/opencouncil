import { rowCandidates, matchesQuery } from '../rowCandidates';

const subjects = [
    { id: 's1', name: 'Θέμα ένα', agendaItemIndex: 1 },
    { id: 's2', name: 'Θέμα δύο', agendaItemIndex: 2 },
];
const base = {
    confidence: null as number | null,
    subjectId: null as string | null,
    decisionNumber: null as string | null,
    title: null as string | null,
    ada: 'ΨΞΚ1',
    conflict: null as { subjectId: string } | null,
};

describe('rowCandidates', () => {
    it('offers an unclaimed decision plainly', () => {
        const c = { ...base, id: 'c1', decisionNumber: '650/2026' };
        const rows = rowCandidates({ subjectId: 's1', candidates: [c], subjectByCandidate: new Map(), subjects, query: '' });
        expect(rows).toEqual([{ kind: 'free', candidate: c, likely: false, elsewhere: null }]);
    });

    it('marks the resolver proposal for this very row as likely and puts it first', () => {
        const other = { ...base, id: 'c1', decisionNumber: '651/2026' };
        const mine = { ...base, id: 'c2', decisionNumber: '650/2026', subjectId: 's1', confidence: 0.9 };
        const rows = rowCandidates({ subjectId: 's1', candidates: [other, mine], subjectByCandidate: new Map(), subjects, query: '' });
        expect(rows[0].candidate.id).toBe('c2');
        expect(rows[0].likely).toBe(true);
    });

    it('says when a decision is only proposed elsewhere, which linking here simply takes over', () => {
        const c = { ...base, id: 'c1', subjectId: 's2', decisionNumber: '651/2026' };
        const rows = rowCandidates({ subjectId: 's1', candidates: [c], subjectByCandidate: new Map(), subjects, query: '' });
        expect(rows[0].kind).toBe('proposedElsewhere');
        expect(rows[0].elsewhere?.id).toBe('s2');
    });

    it('says when a decision is already linked elsewhere, which taking it empties that row', () => {
        const c = { ...base, id: 'c1', decisionNumber: '651/2026' };
        const rows = rowCandidates({ subjectId: 's1', candidates: [c], subjectByCandidate: new Map([['c1', 's2']]), subjects, query: '' });
        expect(rows[0].kind).toBe('linkedElsewhere');
        expect(rows[0].elsewhere?.id).toBe('s2');
    });

    it('never offers the row its own decision back', () => {
        const c = { ...base, id: 'c1', decisionNumber: '650/2026' };
        const rows = rowCandidates({ subjectId: 's1', candidates: [c], subjectByCandidate: new Map([['c1', 's1']]), subjects, query: '' });
        expect(rows).toEqual([]);
    });

    it('leaves out a decision whose ΑΔΑ a subject of another meeting holds', () => {
        // Its holder has no row on this page, so every link here would fail on
        // the server's ΑΔΑ check. The questions card asks about it instead.
        const c = { ...base, id: 'c1', decisionNumber: '651/2026', conflict: { subjectId: 'other-meeting-subject' } };
        const rows = rowCandidates({ subjectId: 's1', candidates: [c], subjectByCandidate: new Map(), subjects, query: '' });
        expect(rows).toEqual([]);
    });

    it('still offers a move when the ΑΔΑ holder is a row of this very meeting', () => {
        const c = { ...base, id: 'c1', decisionNumber: '651/2026', conflict: { subjectId: 's2' } };
        const rows = rowCandidates({ subjectId: 's1', candidates: [c], subjectByCandidate: new Map([['c1', 's2']]), subjects, query: '' });
        expect(rows[0].kind).toBe('linkedElsewhere');
        expect(rows[0].elsewhere?.id).toBe('s2');
    });

    it('puts an exact number match above the proposal, because the person typed it', () => {
        const proposal = { ...base, id: 'c1', decisionNumber: '650/2026', subjectId: 's1', confidence: 0.9 };
        const typed = { ...base, id: 'c2', decisionNumber: '667/2026' };
        const rows = rowCandidates({ subjectId: 's1', candidates: [proposal, typed], subjectByCandidate: new Map(), subjects, query: '667' });
        expect(rows[0].candidate.id).toBe('c2');
    });
});

describe('matchesQuery', () => {
    it('matches on the leading digits of a decision number', () => {
        expect(matchesQuery({ decisionNumber: '650/2026', title: null, ada: 'ΨΞΚ1' }, '65')).toBe(true);
    });

    it('matches on a word from the title, so a half-remembered number is not the only way in', () => {
        expect(matchesQuery({ decisionNumber: null, title: 'Πρόσληψη καθαριστριών', ada: 'ΨΞΚ1' }, 'καθαρ')).toBe(true);
    });

    it('ignores accents and case, the way the rest of the app searches', () => {
        expect(matchesQuery({ decisionNumber: null, title: 'Πρόσληψη ΚΑΘΑΡΙΣΤΡΙΩΝ', ada: 'ΨΞΚ1' }, 'καθαριστριων')).toBe(true);
    });

    it('matches everything on an empty query', () => {
        expect(matchesQuery({ decisionNumber: '650/2026', title: null, ada: 'ΨΞΚ1' }, '  ')).toBe(true);
    });
});
