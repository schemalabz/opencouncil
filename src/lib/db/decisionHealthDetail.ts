import { getConflictingCandidates, type CandidateConflict } from './decisionCandidates';
import {
    fetchDecisionFacts, deriveMissingSessionGroups, isUnplacedQueueCandidate, classifyUnmatchedIn,
    type CandidateFacts, type DecisionFacts, type MeetingFacts, type MissingSessionGroup,
} from './decisionHealth';
import {
    collectMeetingCandidateStats, compareDecisionNumbers, type UnmatchedCause,
} from './decisionHealthDerive';
import { isLogodosiaMeeting } from '../tasks/pollDecisionsBackoff';

/**
 * On-demand detail for one city's row on the decisions overview. Fetched only
 * when the row expands: lists are bounded and every metric derives from the
 * same facts fetch as the overview counts (see decisionHealth.ts for the
 * responseBody rule), so a list can never disagree with its count.
 */

const LIST_CAP = 100;

// List rows project the Prisma-derived facts types (Pick), so a schema change
// that renames a column fails here at compile time instead of drifting. Only
// the computed fields (sessionDate, the non-null meeting narrowing) are local.

export type CityUnplacedCandidate =
    Pick<CandidateFacts, 'id' | 'ada' | 'decisionNumber' | 'title' | 'pdfUrl'> & {
        /** Non-null by construction: the unplaced queue holds placed-to-a-meeting rows. */
        councilMeetingId: string;
        /** City-local calendar date of the meeting, for grouping. */
        sessionDate: string;
    };

export type CityUnmatchedSubject =
    Pick<MeetingFacts['subjects'][number], 'id' | 'name'> & {
        councilMeetingId: string;
        /** City-local calendar date of the meeting, for grouping. */
        sessionDate: string;
    };

/** One failed meeting: identity from the meeting facts, plus its session date. */
export type CityFailedMeeting = Pick<MeetingFacts, 'id' | 'name'> & { sessionDate: string };

export interface CityDecisionDetail {
    conflicts: CandidateConflict[];
    unplaced: CityUnplacedCandidate[];
    missingSessions: MissingSessionGroup[];
    /** Meetings whose most recent poll failed — the city's `blocked` state, drillable. */
    failedMeetings: CityFailedMeeting[];
    /**
     * Body of every meeting of the city (null for meetings without one). The
     * client narrows every list — conflicts, unplaced, failed meetings, the
     * taxonomy — to one body through this single map. The LIST_CAP applies to
     * the city-wide list before that narrowing, so under a body a capped list
     * holds that body's share of the first LIST_CAP rows, not its first
     * LIST_CAP rows.
     */
    bodyIdByMeeting: Record<string, string | null>;
    /** Subjects per taxonomy bucket, capped at LIST_CAP each. */
    unmatched: {
        candidatesUnmatched: CityUnmatchedSubject[];
        nothingFetched: CityUnmatchedSubject[];
        duplicateSubject: CityUnmatchedSubject[];
        /** Meeting-grained: the action for an unprocessed meeting is polling it. */
        notProcessed: Array<{ councilMeetingId: string; sessionDate: string; subjects: number }>;
    };
}

export async function getCityDecisionDetail(cityId: string): Promise<CityDecisionDetail> {
    const [facts, conflicts] = await Promise.all([
        fetchDecisionFacts(cityId),
        getConflictingCandidates({ cityId }),
    ]);
    const meetingById = new Map(facts.meetings.map(m => [m.id, m]));

    return {
        conflicts,
        unplaced: deriveUnplacedList(facts, meetingById),
        missingSessions: deriveMissingSessionGroups(facts),
        failedMeetings: deriveFailedMeetings(facts, meetingById),
        bodyIdByMeeting: Object.fromEntries(facts.meetings.map(m => [m.id, m.administrativeBodyId])),
        unmatched: deriveUnmatchedLists(facts),
    };
}

function deriveUnplacedList(
    facts: DecisionFacts, meetingById: Map<string, MeetingFacts>,
): CityUnplacedCandidate[] {
    // Unread backfill rows are a count (unplacedUnread), not triage work —
    // listing them would let them consume the cap.
    return facts.candidates
        .filter(c => isUnplacedQueueCandidate(c) && c.readStatus !== 'unread')
        .flatMap(c => {
            const meeting = meetingById.get(c.councilMeetingId!);
            if (!meeting) return [];
            return [{
                id: c.id, ada: c.ada, decisionNumber: c.decisionNumber,
                title: c.title, pdfUrl: c.pdfUrl,
                councilMeetingId: c.councilMeetingId!,
                sessionDate: meeting.localDate,
            }];
        })
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)
            || compareDecisionNumbers(a.decisionNumber, b.decisionNumber))
        .slice(0, LIST_CAP);
}

function deriveFailedMeetings(
    facts: DecisionFacts, meetingById: Map<string, MeetingFacts>,
): CityFailedMeeting[] {
    const failed: CityFailedMeeting[] = [];
    for (const latest of facts.latestPollByMeeting.values()) {
        if (latest.status !== 'failed') continue;
        const meeting = meetingById.get(latest.councilMeetingId);
        if (!meeting) continue;
        failed.push({ id: meeting.id, name: meeting.name, sessionDate: meeting.localDate });
    }
    return failed.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || a.id.localeCompare(b.id));
}

function deriveUnmatchedLists(facts: DecisionFacts): CityDecisionDetail['unmatched'] {
    const stats = collectMeetingCandidateStats(facts.candidates);

    // All-time for the city (unlike the overview's windowed counts): the
    // detail is the drill-down, and the drill-down must show everything.
    const classified: Array<CityUnmatchedSubject & { cause: UnmatchedCause }> = [];
    for (const m of facts.meetings) {
        if (isLogodosiaMeeting(m.name)) continue;
        for (const s of m.subjects) {
            if (s.linked) continue;
            classified.push({
                id: s.id, name: s.name, councilMeetingId: m.id, sessionDate: m.localDate,
                cause: classifyUnmatchedIn(facts, stats, m, s),
            });
        }
    }

    // Caps are per cause so one bucket cannot starve another.
    const bucket = (cause: UnmatchedCause): CityUnmatchedSubject[] =>
        classified.filter(r => r.cause === cause)
            .sort((a, b) => a.councilMeetingId.localeCompare(b.councilMeetingId)
                || a.name.localeCompare(b.name, 'el'))
            .slice(0, LIST_CAP)
            .map(({ id, name, councilMeetingId, sessionDate }) => ({ id, name, councilMeetingId, sessionDate }));

    // notProcessed renders as a count-only line per meeting; its subject rows
    // are never listed.
    const notProcessedByMeeting = new Map<string, { councilMeetingId: string; sessionDate: string; subjects: number }>();
    for (const r of classified) {
        if (r.cause !== 'notProcessed') continue;
        const group = notProcessedByMeeting.get(r.councilMeetingId);
        if (group) group.subjects += 1;
        else notProcessedByMeeting.set(r.councilMeetingId, {
            councilMeetingId: r.councilMeetingId, sessionDate: r.sessionDate, subjects: 1,
        });
    }

    return {
        candidatesUnmatched: bucket('candidatesUnmatched'),
        nothingFetched: bucket('nothingFetched'),
        duplicateSubject: bucket('duplicateSubject'),
        notProcessed: [...notProcessedByMeeting.values()]
            .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)
                || a.councilMeetingId.localeCompare(b.councilMeetingId))
            .slice(0, LIST_CAP),
    };
}
