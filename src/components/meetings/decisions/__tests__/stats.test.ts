import { computeDecisionStats } from '../stats';
import type { MeetingCandidate } from '@/lib/db/decisionCandidateShape';

function candidate(over: Partial<MeetingCandidate>): MeetingCandidate {
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

describe('computeDecisionStats', () => {
    it('counts subjects with decisions and conflicts', () => {
        const stats = computeDecisionStats(
            ['s1', 's2', 's3'],
            { s1: {}, s3: {} },
            [
                candidate({ id: 'c1' }),
                candidate({ id: 'c2', ada: 'ΑΔΑ2', conflict: { subjectId: 's9', subjectName: 'Θέμα 9' } }),
            ],
        );
        expect(stats).toEqual({ total: 3, withDecision: 2, conflicts: 1 });
    });

    it('ignores decisions for subjects not in the list', () => {
        const stats = computeDecisionStats(['s1'], { s1: {}, ghost: {} }, []);
        expect(stats).toEqual({ total: 1, withDecision: 1, conflicts: 0 });
    });

    it('handles an empty meeting', () => {
        expect(computeDecisionStats([], {}, [])).toEqual({ total: 0, withDecision: 0, conflicts: 0 });
    });
});
