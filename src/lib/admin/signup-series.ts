/**
 * The arithmetic behind the signups page. Both halves of the page arrive as
 * the same row — the phone subscriptions Notis owns (services/notis/src/lib/
 * subscription-roster.ts) and the email preferences this database owns — so
 * one function answers for the phone channel and for every channel together.
 *
 * Weeks are UTC and start on Monday. The last week is the current one, so it
 * reads as of now.
 */

export const SIGNUP_WEEKS = 12;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** One person's subscription on one channel, over the municipalities it covers. */
export interface SignupRow {
    userId: string;
    cityIds: string[];
    createdAt: Date;
    /** When the subscription stopped. Null while it is on. */
    endedAt: Date | null;
}

export interface WeekTotal {
    /** Monday of the week, YYYY-MM-DD. */
    start: string;
    /** People subscribed at the end of the week. */
    total: number;
}

/** One channel's numbers, or every channel's together. */
export interface SignupSummary {
    /** People subscribed now, in at least one municipality. */
    people: number;
    /** People subscribed now, per municipality. A person in two counts in both. */
    subscribersByCity: Record<string, number>;
    weeks: WeekTotal[];
    newLast7Days: number;
    newPrev7Days: number;
    /** People whose last subscription stopped in the last 7 days. */
    stoppedLast7Days: number;
}

/** Monday 00:00 UTC of the week that holds `at`. */
export function weekStart(at: Date): Date {
    const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const offset = (day.getUTCDay() + 6) % 7;
    return new Date(day.getTime() - offset * DAY_MS);
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One subscription of one person, reduced to the two instants that matter. */
interface Span {
    from: number;
    /** Null while the subscription is on. */
    to: number | null;
}

/** Whether any of a person's subscriptions covers the instant `at`. */
const coversInstant = (spans: Span[], at: number) => spans.some((s) => s.from < at && (s.to === null || s.to >= at));

/**
 * Everything the signups page shows for one set of rows. Rows of several
 * channels sum to the "all" figures: a person counts once, from their first
 * subscription, and counts as subscribed while any one of their subscriptions
 * is on.
 *
 * One known blur: a preference that turns the email summary off leaves no
 * record, so it drops out of every week rather than ending in one.
 */
export function summarizeSignups(rows: SignupRow[], now: Date = new Date()): SignupSummary {
    const spansByPerson = new Map<string, Span[]>();
    const peopleByCity = new Map<string, Set<string>>();
    for (const row of rows) {
        const spans = spansByPerson.get(row.userId);
        const span: Span = { from: row.createdAt.getTime(), to: row.endedAt?.getTime() ?? null };
        if (spans) spans.push(span);
        else spansByPerson.set(row.userId, [span]);
        if (row.endedAt !== null) continue;
        for (const cityId of row.cityIds) {
            const members = peopleByCity.get(cityId);
            if (members) members.add(row.userId);
            else peopleByCity.set(cityId, new Set([row.userId]));
        }
    }

    const everyone = [...spansByPerson.values()];
    const firstAt = everyone.map((spans) => Math.min(...spans.map((s) => s.from)));
    const t = now.getTime();

    const thisWeek = weekStart(now).getTime();
    const weeks: WeekTotal[] = [];
    for (let i = SIGNUP_WEEKS - 1; i >= 0; i--) {
        const start = thisWeek - i * WEEK_MS;
        const end = start + WEEK_MS;
        weeks.push({ start: isoDay(start), total: everyone.filter((spans) => coversInstant(spans, end)).length });
    }

    const newIn = (from: number, to: number) => firstAt.filter((at) => at >= from && at < to).length;
    const stoppedLast7Days = everyone.filter((spans) => {
        if (spans.some((s) => s.to === null)) return false;
        const last = Math.max(...spans.map((s) => s.to as number));
        return last >= t - 7 * DAY_MS && last < t;
    }).length;

    return {
        people: everyone.filter((spans) => coversInstant(spans, t)).length,
        subscribersByCity: Object.fromEntries([...peopleByCity].map(([cityId, members]) => [cityId, members.size])),
        weeks,
        newLast7Days: newIn(t - 7 * DAY_MS, t),
        newPrev7Days: newIn(t - 14 * DAY_MS, t - 7 * DAY_MS),
        stoppedLast7Days,
    };
}
