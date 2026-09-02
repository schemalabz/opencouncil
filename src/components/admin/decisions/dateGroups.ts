import type { CityDecisionDetail } from '@/lib/db/decisionHealthDetail';
import type { CandidateConflict } from '@/lib/db/decisionCandidates';

/**
 * The expansion's list model: everything groups under its session's
 * city-local date, newest first — meetings we hold and probable missing
 * sessions alike. Pure, so the grouping is unit-testable (the same reason
 * groupOrphanRows lives in decisionHealthState).
 */

export type ListRow =
    | { kind: 'conflict'; cf: CandidateConflict }
    | { kind: 'unplaced'; u: CityDecisionDetail['unplaced'][number] }
    | { kind: 'orphan'; d: CityDecisionDetail['missingSessions'][number]['documents'][number] };

export interface DateGroup {
    date: string;
    /** Set when the date is a probable missing session; labels the group. */
    missingKind?: string;
    rows: ListRow[];
}

export type ListFilter = 'pending' | 'conflicts' | 'unplaced' | 'noSession';

export function buildDateGroups(detail: CityDecisionDetail, filter: ListFilter): DateGroup[] {
    const groups = new Map<string, DateGroup>();
    const groupOf = (date: string) => {
        let g = groups.get(date);
        if (!g) { g = { date, rows: [] }; groups.set(date, g); }
        return g;
    };
    if (filter === 'pending' || filter === 'conflicts') {
        detail.conflicts.forEach(cf => groupOf(cf.claimingSubject.sessionDate).rows.push({ kind: 'conflict', cf }));
    }
    if (filter === 'pending' || filter === 'unplaced') {
        detail.unplaced.forEach(u => groupOf(u.sessionDate).rows.push({ kind: 'unplaced', u }));
    }
    if (filter === 'pending' || filter === 'noSession') {
        detail.missingSessions.forEach(g => {
            const target = groupOf(g.date);
            // The label belongs to the missing session even when rows of a
            // same-day meeting created the group first.
            target.missingKind ??= g.kind;
            g.documents.forEach(d => target.rows.push({ kind: 'orphan', d }));
        });
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}
