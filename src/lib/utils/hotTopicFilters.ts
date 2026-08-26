import type { AdministrativeBodyType } from '@prisma/client';

/**
 * The two dials on the overview's ranking, defined once so the server that
 * reads them off the URL and the client that writes them cannot disagree about
 * what a value means or which one is the default.
 */

export type HotScope = 'council' | 'committee' | 'community' | 'all';
export type HotPeriod = '3m' | '6m' | '12m' | 'all';

export const HOT_SCOPES: Record<HotScope, {
    label: string;
    /** Undefined means every body — the meetings query reads it as no filter. */
    types?: AdministrativeBodyType[];
    isDefault: boolean;
}> = {
    // The council is what a reader means by "the council decided", and the
    // committees and κοινότητες of a busy municipality would otherwise crowd it
    // out of its own ranking.
    council: { label: 'scopeCouncil', types: ['council'], isDefault: true },
    committee: { label: 'scopeCommittee', types: ['committee'], isDefault: false },
    community: { label: 'scopeCommunity', types: ['community'], isDefault: false },
    all: { label: 'scopeAll', isDefault: false },
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

/** The instant a period reaches back to — the one definition of that arithmetic. */
export function monthsAgo(months: number): Date {
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    return from;
}

/** Where a period starts, or null when it is not time-bounded. */
export function periodStart(period: HotPeriod): Date | null {
    const months = HOT_PERIODS[period].months;
    return months ? monthsAgo(months) : null;
}

/** A URL value, or the default when it is absent or not one we recognise. */
export function readScope(value: string | undefined): HotScope {
    return value && value in HOT_SCOPES ? (value as HotScope) : 'council';
}

export function readPeriod(value: string | undefined): HotPeriod {
    return value && value in HOT_PERIODS ? (value as HotPeriod) : '3m';
}
