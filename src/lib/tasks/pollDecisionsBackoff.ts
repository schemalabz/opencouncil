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
