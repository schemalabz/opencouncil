import type { AdministrativeBodyType } from '@prisma/client';

/**
 * The two dials on the overview's ranking, defined once so the server that
 * reads them off the URL and the client that writes them cannot disagree about
 * what a value means or which one is the default.
 */

export type HotScope = 'council' | 'committee' | 'community' | 'all';
export type HotPeriod = '3m' | '6m' | '12m' | 'all';

export const HOT_SCOPES: Record<HotScope, {
    /** The abbreviation the closed picker wears — ΔΣ, ΔΕ, ΔΚ. */
    label: string;
    /** What the body is called, for the open menu where there is room to say it. */
    fullLabel: string;
    /** Undefined means every body — the meetings query reads it as no filter. */
    types?: AdministrativeBodyType[];
    isDefault: boolean;
}> = {
    // The council is what a reader means by "the council decided", and the
    // committees and κοινότητες of a busy municipality would otherwise crowd it
    // out of its own ranking.
    council: { label: 'scopeCouncil', fullLabel: 'scopeCouncilFull', types: ['council'], isDefault: true },
    committee: { label: 'scopeCommittee', fullLabel: 'scopeCommitteeFull', types: ['committee'], isDefault: false },
    community: { label: 'scopeCommunity', fullLabel: 'scopeCommunityFull', types: ['community'], isDefault: false },
    all: { label: 'scopeAll', fullLabel: 'scopeAllFull', isDefault: false },
};

export const HOT_PERIODS: Record<HotPeriod, {
    label: string;
    /** Undefined falls back to the ranking's own recent-meetings window. */
    months?: number;
    isDefault: boolean;
}> = {
    '3m': { label: 'period3m', months: 3, isDefault: true },
    '6m': { label: 'period6m', months: 6, isDefault: false },
    '12m': { label: 'period12m', months: 12, isDefault: false },
    all: { label: 'periodAll', isDefault: false },
};

/**
 * The instant a period reaches back to — the one definition of that arithmetic.
 *
 * The day is clamped to the target month's length. setMonth() alone rolls a
 * 29th, 30th or 31st into the month after the one asked for — 31 May less three
 * months lands on 3 March — which reports meetings inside the window as outside
 * it.
 */
export function monthsAgo(months: number, now: Date = new Date()): Date {
    const from = new Date(now);
    // From the first of the month, so the subtraction cannot roll over on its
    // own; the day goes back on afterwards, and the time of day is untouched.
    from.setDate(1);
    from.setMonth(from.getMonth() - months);
    const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    from.setDate(Math.min(now.getDate(), lastDay));
    return from;
}

/** Where a period starts, or null when it is not time-bounded. */
export function periodStart(period: HotPeriod): Date | null {
    const months = HOT_PERIODS[period].months;
    return months ? monthsAgo(months) : null;
}

/**
 * A URL value, or the default when it is absent or not one we recognise.
 *
 * Own keys only: `in` also answers true for `constructor`, `__proto__` and the
 * rest of Object.prototype, and such a value reaches the ranking as a scope or
 * a period with no `types` and no `months` behind it.
 */
export function readScope(value: string | undefined): HotScope {
    return value && Object.hasOwn(HOT_SCOPES, value) ? (value as HotScope) : 'council';
}

export function readPeriod(value: string | undefined): HotPeriod {
    return value && Object.hasOwn(HOT_PERIODS, value) ? (value as HotPeriod) : '3m';
}
