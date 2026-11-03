"use server";

import { withRight } from "@/lib/auth";
import {
    requestPollDecisions as requestPoll,
    resolveCandidateConflict as resolveConflict,
    getPollingHistoryForMeeting as getPollingHistory,
    getLastPollTimeForMeeting as getLastPollTime,
    requestPollDecisionForSubject as requestPollForSubject,
    type PollStart,
} from "@/lib/tasks/pollDecisions";
import { getDecisionForSubject as getDecision } from "@/lib/db/decisions";

/**
 * Browser-facing decision polling. The orchestration module is server-only:
 * it exports the cron entry points and the task result handler too, which a
 * browser must not reach. Each wrapper here either gates on the caller's
 * rights or is public by design.
 */

/** requestPollDecisions gates on `records.edit` for the meeting, and on `admin` for the city for forceExtract. */
export async function requestPollDecisions(
    cityId: string,
    councilMeetingId: string,
    options?: { forceExtract?: boolean; lookupAdas?: string[] },
): Promise<PollStart> {
    return requestPoll(cityId, councilMeetingId, options);
}

/** resolveCandidateConflict gates on `records.edit` for the candidate's meeting, and for the holder's on a reassign. */
export async function resolveCandidateConflict(candidateId: string, resolution: 'reassign' | 'dismiss') {
    return resolveConflict(candidateId, resolution);
}

/** The poll history of a meeting, for the people who administer it. */
export async function getPollingHistoryForMeeting(cityId: string, councilMeetingId: string) {
    await withRight('records.read', { cityId, councilMeetingId });
    return getPollingHistory(cityId, councilMeetingId);
}

/** Public by design: the subject page shows every reader when a meeting was last searched. */
export async function getLastPollTimeForMeeting(meetingId: string, cityId: string): Promise<string | null> {
    return getLastPollTime(meetingId, cityId);
}

/** Public by design: any reader may ask for a search of one subject; the core function rate-limits by open tasks. */
export async function requestPollDecisionForSubject(subjectId: string) {
    return requestPollForSubject(subjectId);
}

/** Public by design: the decision of a subject is public data. */
export async function getDecisionForSubject(subjectId: string) {
    return getDecision(subjectId);
}
