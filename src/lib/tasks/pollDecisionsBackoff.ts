// MeetingDecisionsPage (a client component) imports pollCadence() as a
// value, not just its types. Keep this module free of server-only imports
// (Prisma, `server-only`, ...) — one would break the client build from
// here, with the error pointing at that page instead of this file.

import type { MeetingKind, Prisma } from "@prisma/client";

// ─── Λογοδοσία meeting detection ─────────────────────────────────────

/**
 * Returns true for a Λογοδοσία (accountability) meeting. Used to skip
 * automated decision polling — these meetings don't produce decisions on
 * Diavgeia. A record that also holds a regular meeting (e.g. "Λογοδοσία και
 * Δημοτικό Συμβούλιο") has no kind of its own and is polled: its regular
 * part produces decisions.
 */
export function isLogodosiaMeeting(meeting: { kind: MeetingKind | null }): boolean {
    return meeting.kind === "accountability";
}

/**
 * The database form of `!isLogodosiaMeeting`. `kind` is nullable, and in SQL
 * `NOT (kind = 'accountability')` is not true for a null kind, so a bare
 * `NOT` would drop every meeting of unknown kind. The null case is explicit.
 */
export const NOT_LOGODOSIA_MEETING_WHERE = {
    OR: [{ kind: null }, { kind: { not: "accountability" } }],
} satisfies Prisma.CouncilMeetingWhereInput;

// ─── Backoff configuration ───────────────────────────────────────────
// Controls how often the cron polls for each meeting's decisions.
// Based on time elapsed since the first poll for a meeting.
// With the cron running 2x/day:
//   Days  0–7  → every cron run (~14 polls)
//   Days  7–14 → once per 2 days (~3-4 polls)
//   Days 14–21 → once per 3 days (~2-3 polls)
//   Days 21+   → once per 7 days
//
// Adjust these values based on stats from /api/cron/poll-decisions-stats
export const BACKOFF_SCHEDULE: Array<{ afterDays: number; minIntervalDays: number }> = [
    { afterDays: 0,  minIntervalDays: 0 },   // Week 1: every cron run
    { afterDays: 7,  minIntervalDays: 2 },   // Week 2: once per 2 days
    { afterDays: 14, minIntervalDays: 3 },   // Week 3: once per 3 days
    { afterDays: 21, minIntervalDays: 7 },   // Week 4+: once per week
];
// Stop automatic polling entirely after this many days.
// Manual fetch from the subject page still works.
export const MAX_POLLING_DAYS = 90;
// Don't poll meetings until this many days after they happen — decisions
// never publish on Diavgeia before the meeting (and rarely the same day),
// and agendas are often imported ahead of time.
export const MEETING_POLL_DELAY_DAYS = 1;
// ─────────────────────────────────────────────────────────────────────

/**
 * Date range of meetings eligible for automated decision polling:
 * from MAX_POLLING_DAYS ago up to MEETING_POLL_DELAY_DAYS ago.
 */
export function getPollableMeetingDateRange(now: Date = new Date()): { gte: Date; lte: Date } {
    const dayMs = 24 * 60 * 60 * 1000;
    return {
        gte: new Date(now.getTime() - MAX_POLLING_DAYS * dayMs),
        lte: new Date(now.getTime() - MEETING_POLL_DELAY_DAYS * dayMs),
    };
}

/**
 * Determines whether a meeting should be polled based on its polling history.
 * Returns null if polling should proceed, or a skip reason string if not.
 */
export function shouldSkipPolling(
    firstPollAt: Date | null,
    lastPollAt: Date | null,
): string | null {
    if (!firstPollAt || !lastPollAt) return null; // Never polled → go ahead

    const now = Date.now();
    const daysSinceFirstPoll = (now - firstPollAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceFirstPoll >= MAX_POLLING_DAYS) {
        return `exceeded ${MAX_POLLING_DAYS}-day polling window`;
    }

    // Find the applicable tier (last entry whose afterDays we've passed)
    const tier = [...BACKOFF_SCHEDULE].reverse().find(t => daysSinceFirstPoll >= t.afterDays);
    if (!tier || tier.minIntervalDays === 0) return null; // No backoff yet

    const daysSinceLastPoll = (now - lastPollAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastPoll < tier.minIntervalDays) {
        return `backoff: ${daysSinceLastPoll.toFixed(1)}d since last poll, need ${tier.minIntervalDays}d (day ${daysSinceFirstPoll.toFixed(0)} of polling)`;
    }

    return null;
}

/** The backoff tier a meeting sits in; the UI translates it, the stats endpoint labels it. */
export type BackoffTier =
    | { kind: 'everyRun' }
    | { kind: 'interval'; week: number; intervalDays: number }
    | { kind: 'stopped'; maxDays: number };

function backoffTierLabel(tier: BackoffTier): string {
    switch (tier.kind) {
        case 'everyRun': return 'Every cron run';
        case 'interval': return `Week ${tier.week}: every ${tier.intervalDays}d`;
        case 'stopped': return `Stopped (exceeded ${tier.maxDays}-day window)`;
    }
}

/**
 * Returns the current backoff tier (structured, with its English label) and
 * next eligible poll time for a meeting.
 * Pure function — reused by both getPollingHistoryForMeeting() and batch stats.
 */
export function getBackoffState(
    firstPollAt: Date | null,
    lastPollAt: Date | null,
): { currentTier: BackoffTier | null; currentTierLabel: string | null; nextPollEligible: string | null } {
    if (!firstPollAt || !lastPollAt) {
        return { currentTier: null, currentTierLabel: null, nextPollEligible: null };
    }

    const now = Date.now();
    const daysSinceFirstPoll = (now - firstPollAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceFirstPoll >= MAX_POLLING_DAYS) {
        const stopped: BackoffTier = { kind: 'stopped', maxDays: MAX_POLLING_DAYS };
        return { currentTier: stopped, currentTierLabel: backoffTierLabel(stopped), nextPollEligible: null };
    }

    const tier = [...BACKOFF_SCHEDULE].reverse().find(t => daysSinceFirstPoll >= t.afterDays);

    const currentTier: BackoffTier = !tier || tier.minIntervalDays === 0
        ? { kind: 'everyRun' }
        : { kind: 'interval', week: Math.floor(tier.afterDays / 7) + 1, intervalDays: tier.minIntervalDays };
    const currentTierLabel = backoffTierLabel(currentTier);

    let nextPollEligible: string | null = null;
    if (tier && tier.minIntervalDays > 0) {
        const nextEligible = new Date(lastPollAt.getTime() + tier.minIntervalDays * 24 * 60 * 60 * 1000);
        if (nextEligible.getTime() > now) {
            nextPollEligible = nextEligible.toISOString();
        }
    }

    return { currentTier, currentTierLabel, nextPollEligible };
}

// ─── Poll task status ─────────────────────────────────────────────────

/**
 * The poll task still in flight among a set of tasks, if any — the rows are
 * expected newest first, and the first unfinished one wins. A general
 * pending/processing check: nothing here assumes the caller already
 * filtered to those two statuses.
 *
 * Split out so the page's "we are checking now" line — `pollInFlight` below
 * — has a tested rule: `getPollingHistoryForMeeting` counts only succeeded
 * runs, so without this a poll a person just started reads as nothing
 * happening.
 *
 * Lives here, not in pollDecisions.ts: that module carries `"use server"`,
 * which requires every export to be an async function, and this one is
 * synchronous by design (it's a pure array scan with no I/O).
 */
export function pendingPollTaskId(tasks: ReadonlyArray<{ id: string; status: string }>): string | null {
    return tasks.find(t => t.status === 'pending' || t.status === 'processing')?.id ?? null;
}

// ─── The poll state the decisions page shows ─────────────────────────

/** What the decisions page's poll footer says about a manual poll. */
export type PollCadence =
    | { kind: 'ready' }
    | { kind: 'running' }
    | { kind: 'blocked' };

export interface PollCadenceInput {
    /** False when the city has no Diavgeia organisation id, or a configured
     * unit entry does not parse — either way a poll cannot run at all. */
    canPoll: boolean;
    /** A poll for this meeting is queued or running on the task service. */
    pollInFlight: boolean;
}

/**
 * Map a meeting's polling state onto the footer's three states.
 *
 * The footer no longer names the cron's cadence, so the cron's own gates —
 * the pollable date window, the Λογοδοσία exclusion, the undecided-subject
 * clause and the backoff tier — are not restated here. They stay in
 * `pollDecisionsForRecentMeetings`'s query and in `shouldSkipPolling()`. A
 * meeting the cron skips still reads as `ready`, because a manual poll runs
 * whatever the cron does.
 */
export function pollCadence(input: PollCadenceInput): PollCadence {
    if (!input.canPoll) return { kind: 'blocked' };
    if (input.pollInFlight) return { kind: 'running' };
    return { kind: 'ready' };
}
