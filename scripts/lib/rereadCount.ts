/**
 * The pure counting part of `decisions reread-count` (spec §5.1). Given the
 * meetings the cron's poll query would still dispatch and, for each of their
 * subjects, whether a linked decision will be re-read on that poll, produces
 * the totals and the per-meeting and per-city breakdown. Kept separate from
 * the Prisma query so it is testable without a database.
 */
export interface RereadSubject {
    /** True when this subject carries a decision the next poll will read again. A subject with no decision is not counted: the poll reads it for the first time, not again. */
    stale: boolean;
}

export interface RereadMeeting {
    cityId: string;
    id: string;
    subjects: RereadSubject[];
}

export interface RereadSummary {
    meetings: number;
    pages: number;
    byCity: Record<string, number>;
    /** One line per meeting that has at least one page to read again, `cityId/id: count`. */
    lines: string[];
}

export function summarizeReread(meetings: RereadMeeting[]): RereadSummary {
    let pages = 0;
    const byCity: Record<string, number> = {};
    const lines: string[] = [];
    for (const m of meetings) {
        const stale = m.subjects.filter(s => s.stale).length;
        if (stale === 0) continue;
        pages += stale;
        byCity[m.cityId] = (byCity[m.cityId] ?? 0) + stale;
        lines.push(`${m.cityId}/${m.id}: ${stale}`);
    }
    return { meetings: meetings.length, pages, byCity, lines };
}
