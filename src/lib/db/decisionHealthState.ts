/**
 * What a reader should do about a city, in priority order.
 *
 * Kept free of Prisma imports so it can be unit-tested and shared with client
 * components; `decisionHealth.ts` re-exports it alongside the queries.
 */

export type CityState = 'outOfScope' | 'blocked' | 'needsTriage' | 'draining' | 'notStarted' | 'drained';

export interface CityStateInput {
    inScope: boolean;
    /** Meetings whose most recent poll attempt failed. */
    failedMeetings: number;
    unplacedCandidates: number;
    /** Unread backfill rows are counted but are not triage work. */
    unplacedUnread: number;
    conflicts: number;
    polledMeetings: number;
    meetings: number;
}

/**
 * `drained` does not mean every subject has a decision — roughly a quarter of
 * agenda items produce no published act — it means polling is complete and
 * nothing is waiting for a human.
 */
export function cityState(c: CityStateInput): CityState {
    if (!c.inScope) return 'outOfScope';
    if (c.failedMeetings > 0) return 'blocked';
    // Unread backfill rows are excluded: the UI shows them as a note, not as
    // work, and a state must never demand attention with nothing actionable.
    if (c.unplacedCandidates - c.unplacedUnread > 0 || c.conflicts > 0) return 'needsTriage';
    if (c.polledMeetings === 0) return 'notStarted';
    if (c.polledMeetings < c.meetings) return 'draining';
    return 'drained';
}

/** A read document that names a session, where that session is not a meeting we hold. */
export type UnplaceableKind =
    /** A meeting of some body sits on exactly that date — usually the other body's session. */
    | 'sameDayOtherBody'
    /** A meeting is 1–3 days away. Decision numbering shows these are extra sessions we lack. */
    | 'nearbySessionMissing'
    /** No meeting within 3 days: a session we do not have at all. */
    | 'sessionUnknown';

/** One probable missing session: read documents declaring a date we hold no meeting for. */
export interface MissingSessionGroup {
    /** City-local calendar date the documents declare. */
    date: string;
    kind: UnplaceableKind;
    /** Days to the nearest meeting of the city, null when none exists. */
    nearestMeetingDays: number | null;
    documents: Array<{
        ada: string;
        decisionNumber: string | null;
        title: string | null;
        pdfUrl: string;
    }>;
}

export const NEAR_MISS_DAYS = 3;

/** The gap bucket of one orphan document, from its distance to the nearest
 * meeting of the city. The single definition — the per-city counts and the
 * missing-session groups both read it. */
export function unplaceableKind(days: number | null): UnplaceableKind {
    if (days === 0) return 'sameDayOtherBody';
    if (days !== null && days <= NEAR_MISS_DAYS) return 'nearbySessionMissing';
    return 'sessionUnknown';
}

/** Pure grouping of orphan rows into missing-session groups; exported for tests. */
export function groupOrphanRows(rows: Array<{
    date: string; days: number | null; ada: string;
    decisionNumber: string | null; title: string | null; pdfUrl: string;
}>): MissingSessionGroup[] {
    const byDate = new Map<string, MissingSessionGroup>();
    for (const r of rows) {
        let g = byDate.get(r.date);
        if (!g) {
            g = { date: r.date, kind: unplaceableKind(r.days), nearestMeetingDays: r.days, documents: [] };
            byDate.set(r.date, g);
        }
        g.documents.push({ ada: r.ada, decisionNumber: r.decisionNumber, title: r.title, pdfUrl: r.pdfUrl });
    }
    return [...byDate.values()];
}
