/**
 * Pure derivation logic for the decision-health pages.
 *
 * The data layer fetches typed rows with Prisma and derives every metric here,
 * in plain TypeScript. Each business rule (the unmatched-cause classifier, the
 * decision-number ordering, the orphan gap) exists exactly once, and — like
 * decisionHealthState.ts — this module stays free of Prisma so the rules
 * unit-test without a database.
 */

/** Composite key for a meeting across per-city maps and sets. */
export const meetingKey = (cityId: string, councilMeetingId: string): string =>
    `${cityId}\u0000${councilMeetingId}`;

/** Key of a subject's (meeting, name) slot, for duplicate detection. */
export const subjectNameKey = (cityId: string, councilMeetingId: string, name: string): string =>
    `${cityId}\u0000${councilMeetingId}\u0000${name}`;

/**
 * The calendar date a candidate's `meetingDate` declares. The column stores
 * the document's local date at midnight UTC (see schema), so the UTC calendar
 * date is the declared date — no timezone conversion, unlike meeting
 * `dateTime`, which is a real instant and goes through localCalendarDate.
 */
export const declaredCalendarDate = (meetingDate: Date): string =>
    meetingDate.toISOString().slice(0, 10);

/**
 * True when `dateTime` falls inside the last `sinceDays` days (no lower bound
 * without a window). The future is always excluded: agendas are imported ahead
 * of sessions, and an unheld meeting must not count as unpolled work.
 */
export function isInMeasurementWindow(dateTime: Date, sinceDays: number | null, now: Date): boolean {
    if (dateTime.getTime() > now.getTime()) return false;
    if (sinceDays === null) return true;
    return dateTime.getTime() >= now.getTime() - sinceDays * 86_400_000;
}

/** Why an eligible subject has no decision, by mechanically decidable cause. */
export type UnmatchedCause = 'duplicateSubject' | 'notProcessed' | 'candidatesUnmatched' | 'nothingFetched';

/** Per-meeting candidate facts the unmatched-cause classifier reads. */
export interface MeetingCandidateStats {
    /** Any candidate read at least once ("processed" by the current pipeline). */
    hasReadCandidate: boolean;
    /** Any read, undismissed, unassigned session candidate remains. */
    hasOpenSessionCandidate: boolean;
}

/** Folds candidate rows into the per-meeting stats the classifier needs. */
export function collectMeetingCandidateStats(candidates: Array<{
    cityId: string;
    councilMeetingId: string | null;
    decisionId: string | null;
    dismissedAt: Date | null;
    readStatus: string;
}>): Map<string, MeetingCandidateStats> {
    const stats = new Map<string, MeetingCandidateStats>();
    for (const c of candidates) {
        if (c.councilMeetingId === null) continue;
        const key = meetingKey(c.cityId, c.councilMeetingId);
        let s = stats.get(key);
        if (!s) {
            s = { hasReadCandidate: false, hasOpenSessionCandidate: false };
            stats.set(key, s);
        }
        if (c.readStatus !== 'unread') s.hasReadCandidate = true;
        if (c.decisionId === null && c.dismissedAt === null
            && c.readStatus !== 'unread' && c.readStatus !== 'not_a_decision') {
            s.hasOpenSessionCandidate = true;
        }
    }
    return stats;
}

/**
 * Classifies one unlinked eligible subject by the first cause that applies:
 * duplicate of a linked sibling → meeting not processed by the current
 * pipeline → unassigned session candidates remain (ours) → pool exhausted
 * (probably unpublished). "Processed" means the meeting has at least one read
 * candidate filed to it, which separates reader-era polls from historical
 * ones. The priority order is the semantics — keep it.
 */
export function classifyUnmatchedSubject(
    subject: { cityId: string; councilMeetingId: string; name: string },
    linkedSubjectNameKeys: ReadonlySet<string>,
    stats: MeetingCandidateStats | undefined,
): UnmatchedCause {
    if (linkedSubjectNameKeys.has(subjectNameKey(subject.cityId, subject.councilMeetingId, subject.name))) {
        return 'duplicateSubject';
    }
    if (!stats?.hasReadCandidate) return 'notProcessed';
    if (stats.hasOpenSessionCandidate) return 'candidatesUnmatched';
    return 'nothingFetched';
}

/** Sorts "2" before "10": decision numbers are text but mean integers.
 * Numeric on the digits when both sides have any, nulls and digit-less
 * values last, raw text as the tiebreak. */
export function compareDecisionNumbers(a: string | null, b: string | null): number {
    const ka = decisionNumberValue(a);
    const kb = decisionNumberValue(b);
    if (ka !== null && kb !== null && ka !== kb) return ka - kb;
    if ((ka === null) !== (kb === null)) return ka === null ? 1 : -1;
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
}

function decisionNumberValue(n: string | null): number | null {
    const digits = (n ?? '').replace(/\D+/g, '');
    return digits === '' ? null : Number(digits);
}

/**
 * Whole days between a declared date and the nearest of the city's meetings
 * (any body, any status — including Λογοδοσία and future sessions), or null
 * when the city has no meetings at all. Both sides are calendar dates, so the
 * difference is exact.
 */
export function nearestMeetingGapDays(
    declaredDate: string,
    cityMeetingLocalDates: readonly string[],
): number | null {
    const declared = Date.parse(`${declaredDate}T00:00:00Z`);
    let best: number | null = null;
    for (const local of cityMeetingLocalDates) {
        const gap = Math.abs(Math.round((Date.parse(`${local}T00:00:00Z`) - declared) / 86_400_000));
        if (best === null || gap < best) best = gap;
    }
    return best;
}
