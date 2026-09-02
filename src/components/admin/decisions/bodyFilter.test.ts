import type { CityDecisionDetail } from '@/lib/db/decisionHealthDetail';
import type { CandidateConflict } from '@/lib/db/decisionCandidates';
import { narrowDetailToBody } from './bodyFilter';

const conflict = (meetingId: string) => ({
    candidateId: `cf-${meetingId}`, ada: `ADA-${meetingId}`,
    claimingSubject: { id: `s-${meetingId}`, name: 'S', cityId: 'c1', councilMeetingId: meetingId, sessionDate: '2025-01-10' },
    existingDecision: null,
}) as CandidateConflict;

const detail: CityDecisionDetail = {
    conflicts: [conflict('m1'), conflict('m2')],
    unplaced: [
        { id: 'u1', ada: 'A1', decisionNumber: null, title: null, pdfUrl: 'p', councilMeetingId: 'm1', sessionDate: '2025-01-10' },
        { id: 'u2', ada: 'A2', decisionNumber: null, title: null, pdfUrl: 'p', councilMeetingId: 'm3', sessionDate: '2025-01-14' },
    ],
    missingSessions: [{ date: '2025-01-20', kind: 'sessionUnknown', nearestMeetingDays: 6, documents: [] }],
    failedMeetings: [
        { id: 'm1', name: 'A', sessionDate: '2025-01-10' },
        { id: 'm2', name: 'B', sessionDate: '2025-01-12' },
    ],
    bodyIdByMeeting: { m1: 'b1', m2: 'b2', m3: null },
    unmatched: {
        candidatesUnmatched: [{ id: 's1', name: 'x', councilMeetingId: 'm1', sessionDate: '2025-01-10' }],
        nothingFetched: [{ id: 's2', name: 'y', councilMeetingId: 'm2', sessionDate: '2025-01-12' }],
        duplicateSubject: [],
        notProcessed: [{ councilMeetingId: 'm3', sessionDate: '2025-01-14', subjects: 1 }],
    },
};

describe('narrowDetailToBody', () => {
    test('keeps only rows whose meeting belongs to the body and hides orphan sessions', () => {
        const n = narrowDetailToBody(detail, 'b1');
        expect(n.conflicts.map(c => c.candidateId)).toEqual(['cf-m1']);
        expect(n.unplaced.map(u => u.id)).toEqual(['u1']);
        expect(n.failedMeetings.map(m => m.id)).toEqual(['m1']);
        expect(n.unmatched.candidatesUnmatched.map(s => s.id)).toEqual(['s1']);
        expect(n.unmatched.nothingFetched).toEqual([]);
        expect(n.unmatched.notProcessed).toEqual([]);
        expect(n.missingSessions).toEqual([]);
        expect(n.bodyIdByMeeting).toBe(detail.bodyIdByMeeting);
    });

    test('null selects the meetings that carry no body', () => {
        const n = narrowDetailToBody(detail, null);
        expect(n.conflicts).toEqual([]);
        expect(n.unplaced.map(u => u.id)).toEqual(['u2']);
        expect(n.unmatched.notProcessed.map(m => m.councilMeetingId)).toEqual(['m3']);
    });

    test('a meeting absent from the map matches no body', () => {
        const n = narrowDetailToBody({ ...detail, bodyIdByMeeting: {} }, null);
        expect(n.unplaced).toEqual([]);
    });
});
