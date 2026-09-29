import { isLogodosiaMeeting, pollDueAt } from "./pollDecisionsBackoff";
import { MeetingDecisionCounts } from "../db/decisions";

export type PollSkipReason = "logodosia" | "noEligibleSubjects";

export interface MeetingPollEligibility {
    meetingId: string;
    name: string;
    linked: number;
    eligible: number;
    pollable: boolean;
    alreadyComplete: boolean;
    skipReason: PollSkipReason | null;
}

export interface PollPartition {
    pollable: MeetingPollEligibility[];
    skipped: MeetingPollEligibility[];
    alreadyCompleteCount: number;
}

/**
 * Categorize selected meetings for batch decision polling.
 *
 * Per-meeting gates only — the city-level `diavgeiaUid` requirement is checked
 * separately by the caller (the action is disabled when the city has none).
 *
 * - `skipped`: Λογοδοσία meetings, or meetings with no decision-eligible subjects.
 * - `pollable`: everything else. `alreadyComplete` is true when every eligible
 *   subject already has a linked decision (still pollable for a deliberate
 *   re-poll, but surfaced so the admin knows).
 */
export function partitionMeetingsForPolling(
    meetings: { id: string; name: string }[],
    decisionCounts: MeetingDecisionCounts,
): PollPartition {
    const pollable: MeetingPollEligibility[] = [];
    const skipped: MeetingPollEligibility[] = [];

    for (const meeting of meetings) {
        const counts = decisionCounts[meeting.id] ?? { linked: 0, eligible: 0 };
        const base = {
            meetingId: meeting.id,
            name: meeting.name,
            linked: counts.linked,
            eligible: counts.eligible,
        };

        let skipReason: PollSkipReason | null = null;
        if (isLogodosiaMeeting(meeting.name)) {
            skipReason = "logodosia";
        } else if (counts.eligible === 0) {
            skipReason = "noEligibleSubjects";
        }

        if (skipReason) {
            skipped.push({ ...base, pollable: false, alreadyComplete: false, skipReason });
        } else {
            pollable.push({
                ...base,
                pollable: true,
                alreadyComplete: counts.linked >= counts.eligible,
                skipReason: null,
            });
        }
    }

    return {
        pollable,
        skipped,
        alreadyCompleteCount: pollable.filter(m => m.alreadyComplete).length,
    };
}

/**
 * The cron's dispatch order: most overdue first (see pollDueAt), round-robin
 * across cities.
 *
 * Week-one meetings are due on every run, so a capped batch taken newest
 * first re-polls the same meetings each run while older ones wait. Ordering
 * by due time spreads the cap over the whole backlog along the backoff
 * schedule; a meeting never attempted is due first, so a new one still leads.
 * Ties keep input order (newest first).
 */
export function orderForPolling<T extends { cityId: string; firstPollAt: Date | null; lastAttemptAt: Date | null }>(meetings: T[]): T[] {
    const dueAt = new Map(meetings.map(m => [m, pollDueAt(m.firstPollAt, m.lastAttemptAt)]));
    const overdueFirst = [...meetings].sort((a, b) => {
        const da = dueAt.get(a)!, db = dueAt.get(b)!;
        return da === db ? 0 : da < db ? -1 : 1;
    });
    return interleaveByCity(overdueFirst);
}

/**
 * Round-robin meetings across cities, preserving input order within each city.
 *
 * The cron dispatches the first N meetings that pass backoff. Without the
 * interleave, one city with a deep backlog fills the whole batch, which
 * starves other cities and makes same-city polls run concurrently — parallel
 * polls do not see each other's knownDecisions, so cross-poll candidates
 * duplicate work.
 */
export function interleaveByCity<T extends { cityId: string }>(meetings: T[]): T[] {
    const byCity = new Map<string, T[]>();
    for (const m of meetings) {
        const queue = byCity.get(m.cityId);
        if (queue) queue.push(m);
        else byCity.set(m.cityId, [m]);
    }
    const queues = [...byCity.values()];
    const out: T[] = [];
    for (let round = 0; out.length < meetings.length; round++) {
        for (const queue of queues) {
            if (round < queue.length) out.push(queue[round]);
        }
    }
    return out;
}
