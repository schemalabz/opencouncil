/**
 * The week arithmetic behind the signups page's email numbers — the Notis
 * half arrives computed from the Notis service (services/notis/src/lib/
 * subscription-stats.ts), and this keeps the two on the same calendar: weeks
 * start on Monday, in UTC, and the last one is the current week.
 */

export const SIGNUP_WEEKS = 12;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 UTC of the week that holds `at`. */
export function weekStart(at: Date): Date {
    const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const offset = (day.getUTCDay() + 6) % 7;
    return new Date(day.getTime() - offset * DAY_MS);
}

export interface WeekTotal {
    /** Monday of the week, YYYY-MM-DD. */
    start: string;
    /** How many of the dates fall at or before the end of the week. */
    total: number;
}

/**
 * The running total of `dates` at the end of each of the last SIGNUP_WEEKS
 * weeks: the size of the set as of that Sunday night, and as of now for the
 * current week.
 */
export function cumulativeByWeek(dates: Date[], now: Date = new Date()): WeekTotal[] {
    const thisWeek = weekStart(now).getTime();
    const times = dates.map((d) => d.getTime());
    const weeks: WeekTotal[] = [];
    for (let i = SIGNUP_WEEKS - 1; i >= 0; i--) {
        const start = thisWeek - i * WEEK_MS;
        const end = start + WEEK_MS;
        weeks.push({ start: new Date(start).toISOString().slice(0, 10), total: times.filter((t) => t < end).length });
    }
    return weeks;
}

/** How many of `dates` fall in the last 7 days, and in the 7 before them. */
export function lastTwoWeeks(dates: Date[], now: Date = new Date()): { last7Days: number; prev7Days: number } {
    const t = now.getTime();
    const within = (d: Date, from: number, to: number) => d.getTime() >= from && d.getTime() < to;
    return {
        last7Days: dates.filter((d) => within(d, t - 7 * DAY_MS, t)).length,
        prev7Days: dates.filter((d) => within(d, t - 14 * DAY_MS, t - 7 * DAY_MS)).length,
    };
}
