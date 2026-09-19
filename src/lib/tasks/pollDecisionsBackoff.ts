// MeetingDecisionsPage (a client component) imports pollCadence() as a
// value, not just its types. Keep this module free of server-only imports
// (Prisma, `server-only`, ...) — one would break the client build from
// here, with the error pointing at that page instead of this file.

// ─── Λογοδοσία meeting detection ─────────────────────────────────────
// Stem used to identify Λογοδοσία (accountability) meetings by name.
// Covers both "Λογοδοσία" and "Λογοδοσίας" (genitive).
// TODO: Replace with proper meeting tags once available.
export const LOGODOSIA_NAME_PATTERN = "Λογοδοσί";

/**
 * Returns true if the meeting name indicates a Λογοδοσία session.
 * Used to skip automated decision polling — these meetings don't produce
 * decisions on Diavgeia. Combined meetings (e.g. "Λογοδοσία και Δημοτικό
 * Συμβούλιο") are also matched; they can still be polled manually.
 */
export function isLogodosiaMeeting(name: string): boolean {
    return name.includes(LOGODOSIA_NAME_PATTERN);
}

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

// ─── The cadence the decisions page names ────────────────────────────

/**
 * Why the cron will never reach this meeting, however its backoff tier reads.
 * Each one is a gate in `pollDecisionsForRecentMeetings`'s own query.
 */
export type ManualOnlyReason = 'allDecided' | 'excludedMeeting' | 'notYet';

/** What the decisions page's poll footer says about automatic polling. */
export type PollCadence =
    | { kind: 'idle'; everyDays: number | null; nextCheck: string | null }
    | { kind: 'manualOnly'; reason: ManualOnlyReason }
    | { kind: 'running' }
    | { kind: 'blocked' };

export interface PollCadenceInput {
    /** False when the city has no Diavgeia organisation id, or a configured
     * unit entry does not parse — either way a poll cannot run at all. */
    canPoll: boolean;
    /** A poll for this meeting is queued or running on the task service. */
    pollInFlight: boolean;
    currentTier: BackoffTier | null;
    /** `nextPollEligible`, already formatted for the reader, or null. */
    nextCheck: string | null;
    /** The cron selects only meetings that still have an eligible subject with
     * no decision, so the last row a clerk fills is also the last poll. */
    everySubjectDecided: boolean;
    /** The cron excludes Λογοδοσία meetings by name. */
    meetingName: string;
    /** The cron only selects meetings inside `getPollableMeetingDateRange()`. */
    meetingDate: Date;
    now?: Date;
}

/**
 * The first tier of BACKOFF_SCHEDULE polls on every cron run, which happens
 * more than once a day. The footer names a cadence in whole days, so one day
 * is the finest cadence it can say.
 */
export const EVERY_RUN_CADENCE_DAYS = 1;

/**
 * Map a meeting's polling state onto the cadence the page shows.
 *
 * A meeting nobody has polled yet has no tier at all. The next cron run picks
 * it up, so it reads as the frequent cadence — `null` `everyDays` is reserved
 * for a meeting that left the polling window, which the footer alone renders
 * as "we stopped".
 *
 * A tier says how often the cron *would* come back; it says nothing about
 * whether the cron selects this meeting at all. The gates below are that
 * query's, in the same order of finality: a page that names a cadence for a
 * meeting the cron skips promises a check nobody will run.
 */
export function pollCadence(input: PollCadenceInput): PollCadence {
    if (!input.canPoll) return { kind: 'blocked' };
    if (input.pollInFlight) return { kind: 'running' };
    if (input.everySubjectDecided) return { kind: 'manualOnly', reason: 'allDecided' };
    if (isLogodosiaMeeting(input.meetingName)) return { kind: 'manualOnly', reason: 'excludedMeeting' };

    const window = getPollableMeetingDateRange(input.now ?? new Date());
    if (input.meetingDate.getTime() > window.lte.getTime()) return { kind: 'manualOnly', reason: 'notYet' };
    // Out the far end of the window is the same fact the stopped tier states,
    // and the footer already has a sentence for it.
    if (input.meetingDate.getTime() < window.gte.getTime()) return { kind: 'idle', everyDays: null, nextCheck: null };
    if (input.currentTier?.kind === 'stopped') return { kind: 'idle', everyDays: null, nextCheck: null };
    return {
        kind: 'idle',
        everyDays: input.currentTier?.kind === 'interval' ? input.currentTier.intervalDays : EVERY_RUN_CADENCE_DAYS,
        nextCheck: input.nextCheck,
    };
}
