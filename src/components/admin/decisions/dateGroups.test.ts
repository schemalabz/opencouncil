import { buildDateGroups } from './dateGroups';
import type { CityDecisionDetail } from '@/lib/db/decisionHealthDetail';

const conflict = (sessionDate: string) => ({
    candidateId: `c-${sessionDate}`, ada: `ADA-${sessionDate}`,
    claimingSubject: { id: 's', name: 'S', cityId: 'x', councilMeetingId: 'm', sessionDate },
    existingDecision: null,
}) as CityDecisionDetail['conflicts'][number];

const unplaced = (sessionDate: string, id: string) => ({
    id, ada: `ADA-${id}`, decisionNumber: null, title: null, pdfUrl: 'p',
    councilMeetingId: 'm', sessionDate,
}) as CityDecisionDetail['unplaced'][number];

const detail = (over: Partial<CityDecisionDetail>): CityDecisionDetail => ({
    conflicts: [], unplaced: [], missingSessions: [], failedMeetings: [], bodyIdByMeeting: {},
    unmatched: { candidatesUnmatched: [], nothingFetched: [], duplicateSubject: [], notProcessed: [] },
    ...over,
});

describe('buildDateGroups', () => {
    it('groups all kinds under their date, newest first', () => {
        const groups = buildDateGroups(detail({
            conflicts: [conflict('2026-02-11')],
            unplaced: [unplaced('2026-02-11', 'u1'), unplaced('2026-01-29', 'u2')],
            missingSessions: [{
                date: '2026-02-13', kind: 'nearbySessionMissing', nearestMeetingDays: 2,
                documents: [{ ada: 'A', decisionNumber: null, title: null, pdfUrl: 'p' }],
            }],
        }), 'pending');
        expect(groups.map(g => g.date)).toEqual(['2026-02-13', '2026-02-11', '2026-01-29']);
        expect(groups[1].rows.map(r => r.kind)).toEqual(['conflict', 'unplaced']);
    });

    it('keeps the missing-session label when a meeting row created the group first', () => {
        // sameDayOtherBody orphans share their date with a real meeting.
        const groups = buildDateGroups(detail({
            unplaced: [unplaced('2026-01-29', 'u1')],
            missingSessions: [{
                date: '2026-01-29', kind: 'sameDayOtherBody', nearestMeetingDays: 0,
                documents: [{ ada: 'A', decisionNumber: null, title: null, pdfUrl: 'p' }],
            }],
        }), 'pending');
        expect(groups).toHaveLength(1);
        expect(groups[0].missingKind).toBe('sameDayOtherBody');
    });

    it('filters to a single kind', () => {
        const groups = buildDateGroups(detail({
            conflicts: [conflict('2026-02-11')],
            unplaced: [unplaced('2026-02-11', 'u1')],
        }), 'conflicts');
        expect(groups).toHaveLength(1);
        expect(groups[0].rows).toHaveLength(1);
        expect(groups[0].rows[0].kind).toBe('conflict');
    });
});
