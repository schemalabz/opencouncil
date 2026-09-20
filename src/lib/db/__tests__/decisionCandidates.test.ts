import { shapeCandidates, type AdaHolder } from '@/lib/db/decisionCandidateShape';

const ATHENS = 'Europe/Athens';

function row(ada: string, overrides: Partial<Parameters<typeof shapeCandidates>[0][0]> = {}) {
    return {
        id: `cand-${ada}`,
        ada,
        title: null,
        pdfUrl: `https://diavgeia.gov.gr/doc/${ada}`,
        publishDate: null,
        meetingDate: null,
        decisionNumber: null,
        readStatus: 'ok',
        subjectId: null,
        confidence: null,
        reasoning: null,
        ...overrides,
    };
}

describe('shapeCandidates', () => {
    it('marks a candidate whose ADA is held by another subject as conflicting', () => {
        const holders: AdaHolder[] = [{ ada: 'A1', subjectId: 'sub-9', subjectName: 'Έγκριση προϋπολογισμού' }];
        const shaped = shapeCandidates([row('A1'), row('A2')], holders, ATHENS);
        expect(shaped[0].conflict).toEqual({ subjectId: 'sub-9', subjectName: 'Έγκριση προϋπολογισμού' });
        expect(shaped[1].conflict).toBeNull();
    });

    it('passes candidate fields through unchanged', () => {
        const shaped = shapeCandidates([row('A1', { decisionNumber: '425/2026', subjectId: 'sub-1', confidence: 0.9 })], [], ATHENS);
        expect(shaped[0]).toMatchObject({ ada: 'A1', decisionNumber: '425/2026', subjectId: 'sub-1', confidence: 0.9, conflict: null });
    });

    it('puts a late-evening publish instant on the city\'s calendar, not the UTC one', () => {
        // 21:30 UTC is 00:30 the next day in Athens summer. Keeping the instant
        // and slicing its first ten characters downstream printed 24 July for a
        // decision the city published on the 25th.
        const shaped = shapeCandidates([row('A1', { publishDate: new Date('2026-07-24T21:30:00.000Z') })], [], ATHENS);
        expect(shaped[0].publishDate).toBe('2026-07-25');
    });

    it('leaves a candidate with no publish date null', () => {
        expect(shapeCandidates([row('A1')], [], ATHENS)[0].publishDate).toBeNull();
    });
});
