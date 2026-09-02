import type { CityDecisionDetail } from '@/lib/db/decisionHealthDetail';

/**
 * The city detail seen through one administrative body: every list keeps
 * only rows whose meeting belongs to the body. Orphan documents (missing
 * sessions) belong to no meeting, so they belong to no body and drop out.
 */
export function narrowDetailToBody(detail: CityDecisionDetail, bodyId: string | null): CityDecisionDetail {
    const inBody = (meetingId: string) => detail.bodyIdByMeeting[meetingId] === bodyId;
    return {
        conflicts: detail.conflicts.filter(c => inBody(c.claimingSubject.councilMeetingId)),
        unplaced: detail.unplaced.filter(u => inBody(u.councilMeetingId)),
        missingSessions: [],
        failedMeetings: detail.failedMeetings.filter(m => inBody(m.id)),
        bodyIdByMeeting: detail.bodyIdByMeeting,
        unmatched: {
            candidatesUnmatched: detail.unmatched.candidatesUnmatched.filter(s => inBody(s.councilMeetingId)),
            nothingFetched: detail.unmatched.nothingFetched.filter(s => inBody(s.councilMeetingId)),
            duplicateSubject: detail.unmatched.duplicateSubject.filter(s => inBody(s.councilMeetingId)),
            notProcessed: detail.unmatched.notProcessed.filter(m => inBody(m.councilMeetingId)),
        },
    };
}
