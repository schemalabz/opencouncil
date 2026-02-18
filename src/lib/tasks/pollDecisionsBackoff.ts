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
// ─────────────────────────────────────────────────────────────────────

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
