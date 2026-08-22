import { shapeCandidates, type AdaHolder } from '@/lib/db/decisionCandidateShape';

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
        const shaped = shapeCandidates([row('A1'), row('A2')], holders);
        expect(shaped[0].conflict).toEqual({ subjectId: 'sub-9', subjectName: 'Έγκριση προϋπολογισμού' });
        expect(shaped[1].conflict).toBeNull();
    });

    it('passes candidate fields through unchanged', () => {
        const shaped = shapeCandidates([row('A1', { decisionNumber: '425/2026', subjectId: 'sub-1', confidence: 0.9 })], []);
        expect(shaped[0]).toMatchObject({ ada: 'A1', decisionNumber: '425/2026', subjectId: 'sub-1', confidence: 0.9, conflict: null });
    });
});
