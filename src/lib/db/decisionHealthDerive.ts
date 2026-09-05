/**
 * Pure derivation logic for the decision-health pages.
 *
 * The data layer fetches typed rows with Prisma and derives every metric here,
 * in plain TypeScript. Each business rule (the unmatched-cause classifier, the
 * decision-number ordering, the orphan gap) exists exactly once, and — like
 * decisionHealthState.ts — this module stays free of Prisma so the rules
 * unit-test without a database.
 */

import type { AdministrativeBodyType } from '@prisma/client';

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

/**
 * The windowed measurements of one scope — a city, or one administrative
 * body of a city. Both rows of the overview share this record, so the
 * body rows always sum to the city row.
 */
export interface CoverageMeasures {
    /** Held meetings with eligible subjects inside the window. */
    meetings: number;
    /** Of those, meetings with at least one succeeded poll. */
    polledMeetings: number;
    eligibleSubjects: number;
    linkedSubjects: number;
    /** Links whose decision carries its excerpt (and with it attendance and votes). */
    contentLinks: number;
    /** Why eligible subjects have no decision, by mechanically decidable cause. */
    unmatchedTaxonomy: {
        /** The subject's meeting has no read documents: the current pipeline has not processed it. */
        notProcessed: number;
        /** Meeting processed, and unassigned session candidates remain: matching material existed. Ours to explain. */
        candidatesUnmatched: number;
        /** Meeting processed and its candidate pool is exhausted: probably never published. */
        nothingFetched: number;
        /** An identically named subject in the same meeting already holds the decision. Data-quality issue, not a gap. */
        duplicateSubject: number;
    };
}

/**
 * The work queues a meeting scope holds — a city, or one body of a city.
 * Always all-time, never windowed. Orphan documents are not here: they
 * belong to no meeting, so they belong to the city alone.
 */
export interface MeetingQueues {
    unplacedCandidates: number;
    /** Of those, candidates never read — mostly rows the legacy backfill created. */
    unplacedUnread: number;
    conflicts: number;
    /**
     * Meetings whose most recent poll attempt failed. All-time failure counts are
     * not actionable — a city can carry dozens of old failures and be healthy — so
     * this counts only meetings currently sitting in a failed state.
     */
    failedMeetings: number;
}

export function emptyMeetingQueues(): MeetingQueues {
    return { unplacedCandidates: 0, unplacedUnread: 0, conflicts: 0, failedMeetings: 0 };
}

export function emptyCoverage(): CoverageMeasures {
    return {
        meetings: 0, polledMeetings: 0, eligibleSubjects: 0, linkedSubjects: 0, contentLinks: 0,
        unmatchedTaxonomy: { notProcessed: 0, candidatesUnmatched: 0, nothingFetched: 0, duplicateSubject: 0 },
    };
}

/** One eligible subject as the accumulator sees it: linked (with or without the decision's excerpt), or unlinked with its cause. */
export type MeasuredSubject =
    | { linked: true; content: boolean }
    | { linked: false; cause: UnmatchedCause };

/** One meeting after its facts are resolved: measured once, folded into every scope it belongs to. */
export interface MeasuredMeeting {
    polled: boolean;
    subjects: MeasuredSubject[];
}

/** Folds one measured meeting into a coverage record. The single measurement rule. */
export function accumulateMeeting(into: CoverageMeasures, meeting: MeasuredMeeting): void {
    into.meetings += 1;
    if (meeting.polled) into.polledMeetings += 1;
    into.eligibleSubjects += meeting.subjects.length;
    for (const s of meeting.subjects) {
        if (s.linked) {
            into.linkedSubjects += 1;
            if (s.content) into.contentLinks += 1;
        } else {
            into.unmatchedTaxonomy[s.cause] += 1;
        }
    }
}

/** Composite key of a body scope; `null` is the city's "no body" bucket. */
export const bodyKey = (cityId: string, bodyId: string | null): string =>
    `${cityId}\u0000${bodyId ?? ''}`;

const BODY_TYPE_ORDER: Record<AdministrativeBodyType, number> = { council: 0, committee: 1, community: 2 };

/**
 * Councils, then committees, then communities, by Greek name within a type;
 * the "no body" row last. Independent of the window, so rows never move
 * when the window changes.
 */
export function compareBodyRows(
    a: { body: { type: AdministrativeBodyType; name: string } | null },
    b: { body: { type: AdministrativeBodyType; name: string } | null },
): number {
    if (a.body === null || b.body === null) return (a.body === null ? 1 : 0) - (b.body === null ? 1 : 0);
    return BODY_TYPE_ORDER[a.body.type] - BODY_TYPE_ORDER[b.body.type]
        || a.body.name.localeCompare(b.body.name, 'el');
}
