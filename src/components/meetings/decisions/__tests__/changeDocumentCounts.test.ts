import { changeKey, documentCountsByChange } from '../changeDocumentCounts';
import type { EventRow } from '@/lib/derivation/types';

describe('documentCountsByChange', () => {
    const event = (kind: EventRow['kind'], reportingDocuments: number): EventRow => ({
        id: `e-${kind}`, personId: 'p1', kind, anchorKind: 'SUBJECT', anchorAgendaItemIndex: null, anchorNonAgendaReason: null,
        anchorDecisionNumber: null, anchorSubjectId: 's1', anchorPhase: null, timing: 'BEFORE', rawText: 'απουσίαζε ο Π.',
        reportingDocuments, totalDocuments: 5, source: 'decision',
    });

    it('keeps apart a departure and an arrival that share a sentence, as a combined per-vote absence gives them', () => {
        const counts = documentCountsByChange([event('DEPARTURE', 3), event('ARRIVAL', 2)]);
        expect(counts.get(changeKey({ personId: 'p1', type: 'departure', rawText: 'απουσίαζε ο Π.' }))).toEqual({ reportingDocuments: 3, totalDocuments: 5 });
        expect(counts.get(changeKey({ personId: 'p1', type: 'arrival', rawText: 'απουσίαζε ο Π.' }))).toEqual({ reportingDocuments: 2, totalDocuments: 5 });
    });
});
