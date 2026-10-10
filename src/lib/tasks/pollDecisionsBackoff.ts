// MeetingDecisionsPage (a client component) imports pollCadence() as a
// value, not just its types. Keep this module free of server-only imports
// (Prisma, `server-only`, ...) — one would break the client build from
// here, with the error pointing at that page instead of this file.

import type { MeetingKind, Prisma } from "@prisma/client";
import { MEETING_KINDS, NO_DECISION_KINDS } from "@/lib/meetingLifecycleRules";

// ─── Meetings that take no decisions ─────────────────────────────────

/**
 * Returns true for a meeting that takes no decisions: a λογοδοσία or an
 * απολογισμός. Used to skip automated decision polling. A later part has no
 * kind of its own, so the kind of its first part counts. A record that also
 * holds a regular meeting (e.g. "Λογοδοσία και Δημοτικό Συμβούλιο") has no
 * kind and is polled: its regular part produces decisions.
 */
export function takesNoDecisions(meeting: { kind: MeetingKind | null; continuationOf: { kind: MeetingKind | null } | null }): boolean {
    const kind = meeting.kind ?? meeting.continuationOf?.kind ?? null;
    return kind !== null && !MEETING_KINDS[kind].takesDecisions;
}

/** The fields `takesNoDecisions` reads. An `include` takes its `continuationOf`. */
export const DECISION_KIND_SELECT = {
    kind: true,
    continuationOf: { select: { kind: true } },
} satisfies Prisma.CouncilMeetingSelect;

/**
 * The database form of `!takesNoDecisions`. `kind` is nullable, and in SQL
 * `kind NOT IN (…)` is not true for a null kind, so a bare `notIn` would drop
 * every meeting of unknown kind. The null case is explicit.
 */
const KIND_TAKES_DECISIONS_WHERE = {
    OR: [{ kind: null }, { kind: { notIn: NO_DECISION_KINDS } }],
} satisfies Prisma.CouncilMeetingWhereInput;

export const TAKES_DECISIONS_WHERE = {
    AND: [
        KIND_TAKES_DECISIONS_WHERE,
        { OR: [{ continuationOfId: null }, { continuationOf: KIND_TAKES_DECISIONS_WHERE }] },
    ],
} satisfies Prisma.CouncilMeetingWhereInput;

// ─── Backoff configuration ───────────────────────────────────────────
// Controls how often each meeting becomes due for a cron poll — a floor,
// not a promise: each run dispatches at most 10, most overdue first (see
// pollDueAt). Based on time elapsed since the first poll.
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** The schedule entry in force `daysSinceFirstPoll` days in (last one passed). */
function scheduleEntry(daysSinceFirstPoll: number): { afterDays: number; minIntervalDays: number } | undefined {
    return [...BACKOFF_SCHEDULE].reverse().find(t => daysSinceFirstPoll >= t.afterDays);
}

/**
 * When a meeting falls due for its next cron poll: its last poll plus the
 * interval its backoff tier asks for. `-Infinity` when it was never polled —
 * due before anything else. The cron dispatches the earliest first, so when
 * more meetings are due than a batch takes, the most overdue go first rather
 * than the newest.
 *
 * `lastPollAt` may be the last attempt of any outcome: the cron passes that,
 * so a meeting whose polls keep failing waits its turn instead of leading
 * every batch.
 */
export function pollDueAt(firstPollAt: Date | null, lastPollAt: Date | null): number {
    if (!lastPollAt) return -Infinity;
    const daysSinceFirstPoll = firstPollAt ? (Date.now() - firstPollAt.getTime()) / DAY_MS : 0;
    const intervalDays = scheduleEntry(daysSinceFirstPoll)?.minIntervalDays ?? 0;
    return lastPollAt.getTime() + intervalDays * DAY_MS;
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
    const daysSinceFirstPoll = (now - firstPollAt.getTime()) / DAY_MS;

    if (daysSinceFirstPoll >= MAX_POLLING_DAYS) {
        return `exceeded ${MAX_POLLING_DAYS}-day polling window`;
    }

    const tier = scheduleEntry(daysSinceFirstPoll);
    if (!tier || tier.minIntervalDays === 0) return null; // No backoff yet

    if (now < pollDueAt(firstPollAt, lastPollAt)) {
        const daysSinceLastPoll = (now - lastPollAt.getTime()) / DAY_MS;
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
    const daysSinceFirstPoll = (now - firstPollAt.getTime()) / DAY_MS;

    if (daysSinceFirstPoll >= MAX_POLLING_DAYS) {
        const stopped: BackoffTier = { kind: 'stopped', maxDays: MAX_POLLING_DAYS };
        return { currentTier: stopped, currentTierLabel: backoffTierLabel(stopped), nextPollEligible: null };
    }

    const tier = scheduleEntry(daysSinceFirstPoll);

    const currentTier: BackoffTier = !tier || tier.minIntervalDays === 0
        ? { kind: 'everyRun' }
        : { kind: 'interval', week: Math.floor(tier.afterDays / 7) + 1, intervalDays: tier.minIntervalDays };
    const currentTierLabel = backoffTierLabel(currentTier);

    const dueAt = pollDueAt(firstPollAt, lastPollAt);
    const nextPollEligible = dueAt > now ? new Date(dueAt).toISOString() : null;

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
    | { kind: 'blocked' }
    | { kind: 'noDecisions' };

export interface PollCadenceInput {
    /** The meeting takes no decisions (see takesNoDecisions): a poll can find none. */
    noDecisions: boolean;
    /** False when the city has no Diavgeia organisation id, or a configured
     * unit entry does not parse — either way a poll cannot run at all. */
    canPoll: boolean;
    /** A poll for this meeting is queued or running on the task service. */
    pollInFlight: boolean;
}

/**
 * Map a meeting's polling state onto the footer's four states.
 *
 * The footer no longer names the cron's cadence, so the cron's own gates —
 * the pollable date window, the undecided-subject clause and the backoff
 * tier — are not restated here. They stay in
 * `pollDecisionsForRecentMeetings`'s query and in `shouldSkipPolling()`. A
 * meeting the cron skips for those reasons still reads as `ready`, because a
 * manual poll runs whatever the cron does. A meeting that takes no decisions
 * reads as `noDecisions`: no poll, by the cron or by hand, can find any.
 */
export function pollCadence(input: PollCadenceInput): PollCadence {
    if (input.noDecisions) return { kind: 'noDecisions' };
    if (!input.canPoll) return { kind: 'blocked' };
    if (input.pollInFlight) return { kind: 'running' };
    return { kind: 'ready' };
}
