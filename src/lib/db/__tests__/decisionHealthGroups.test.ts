import { groupOrphanRows } from '../decisionHealthState';

const row = (date: string, days: number | null, ada: string, num: string | null = null) =>
    ({ date, days, ada, decisionNumber: num, title: null, pdfUrl: `https://diavgeia.gov.gr/doc/${ada}` });

describe('groupOrphanRows', () => {
    it('groups documents by declared date and classifies by nearest-meeting distance', () => {
        const groups = groupOrphanRows([
            row('2025-12-17', 5, 'A1', '167/2025'),
            row('2025-12-17', 5, 'A2', '168/2025'),
            row('2026-04-16', 1, 'B1', '105/2026'),
            row('2026-06-29', 0, 'C1', '69/2026'),
            row('2026-01-01', null, 'D1'),
        ]);
        expect(groups).toHaveLength(4);
        const dec17 = groups.find(g => g.date === '2025-12-17')!;
        expect(dec17.kind).toBe('sessionUnknown');
        expect(dec17.documents.map(d => d.decisionNumber)).toEqual(['167/2025', '168/2025']);
        expect(groups.find(g => g.date === '2026-04-16')!.kind).toBe('nearbySessionMissing');
        expect(groups.find(g => g.date === '2026-06-29')!.kind).toBe('sameDayOtherBody');
        expect(groups.find(g => g.date === '2026-01-01')!.kind).toBe('sessionUnknown');
    });

    it('treats the boundary of the near-miss window as nearby, one past it as unknown', () => {
        const groups = groupOrphanRows([row('2025-01-01', 3, 'A'), row('2025-01-02', 4, 'B')]);
        expect(groups.find(g => g.date === '2025-01-01')!.kind).toBe('nearbySessionMissing');
        expect(groups.find(g => g.date === '2025-01-02')!.kind).toBe('sessionUnknown');
    });
});
