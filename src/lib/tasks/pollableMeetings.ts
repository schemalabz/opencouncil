import { isLogodosiaMeeting } from "./pollDecisionsBackoff";
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
