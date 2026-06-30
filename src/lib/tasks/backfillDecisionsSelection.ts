import { isLogodosiaMeeting } from "@/lib/tasks/pollDecisionsBackoff";

/**
 * Pure selection logic for the one-time decision backfill (issue #461).
 *
 * Kept free of DB/env imports so it can be unit-tested in isolation — the
 * runner (`backfillDecisions.ts`) builds candidates from the DB and feeds them
 * here. This is the single source of truth for "dispatch or skip, and why".
 */

export interface BackfillCandidate {
    cityId: string;
    meetingId: string;
    meetingName: string;
    dateTime: Date;
    /** Eligible subjects (agenda or outOfAgenda, not withdrawn). */
    eligibleSubjectCount: number;
    /** Eligible subjects that already have a linked decision. */
    linkedDecisionCount: number;
    /** Most recent succeeded pollDecisions task for this meeting, if any. */
    lastSucceededPollAt: Date | null;
    /** True if a pollDecisions task is currently pending/running for this meeting. */
    hasInProgressPoll: boolean;
}

export interface BackfillSelectionOptions {
    /** Skip meetings whose last succeeded poll is newer than this many days. */
    skipRecentDays: number;
    /** Injectable clock for deterministic tests. Defaults to now. */
    now?: Date;
}

export interface BackfillDecision {
    candidate: BackfillCandidate;
    dispatch: boolean;
    skipReason?: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Decides, per candidate, whether to dispatch a poll or skip (with a reason).
 * Pure and deterministic.
 *
 * Returns decisions sorted oldest-first so the longest-missing meetings are
 * dispatched before newer ones.
 */
export function selectBackfillMeetings(
    candidates: BackfillCandidate[],
    options: BackfillSelectionOptions,
): BackfillDecision[] {
    const now = (options.now ?? new Date()).getTime();
    const skipRecentMs = options.skipRecentDays * MS_PER_DAY;

    const decisions = candidates.map((candidate): BackfillDecision => {
        if (candidate.eligibleSubjectCount === 0) {
            return { candidate, dispatch: false, skipReason: "no eligible subjects" };
        }

        if (candidate.linkedDecisionCount >= candidate.eligibleSubjectCount) {
            return { candidate, dispatch: false, skipReason: "all eligible subjects already linked" };
        }

        if (isLogodosiaMeeting(candidate.meetingName)) {
            return { candidate, dispatch: false, skipReason: "Λογοδοσία meeting" };
        }

        if (candidate.hasInProgressPoll) {
            return { candidate, dispatch: false, skipReason: "poll already in progress" };
        }

        if (
            candidate.lastSucceededPollAt &&
            now - candidate.lastSucceededPollAt.getTime() < skipRecentMs
        ) {
            const daysAgo = ((now - candidate.lastSucceededPollAt.getTime()) / MS_PER_DAY).toFixed(1);
            return {
                candidate,
                dispatch: false,
                skipReason: `polled ${daysAgo}d ago (< ${options.skipRecentDays}d skip-recent window)`,
            };
        }

        return { candidate, dispatch: true };
    });

    return decisions.sort(
        (a, b) => a.candidate.dateTime.getTime() - b.candidate.dateTime.getTime(),
    );
}
