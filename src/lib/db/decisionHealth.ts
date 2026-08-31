import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { localCalendarDate } from '../formatters/time';
import { isLogodosiaMeeting } from '../tasks/pollDecisionsBackoff';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from './decisionEligibility';
import { getConflictingCandidates } from './decisionCandidates';
import { groupOrphanRows, unplaceableKind } from './decisionHealthState';
import type { MissingSessionGroup, UnplaceableKind } from './decisionHealthState';
import {
    classifyUnmatchedSubject, collectMeetingCandidateStats, compareDecisionNumbers,
    declaredCalendarDate, isInMeasurementWindow, meetingKey, nearestMeetingGapDays, subjectNameKey,
    type MeetingCandidateStats, type UnmatchedCause,
} from './decisionHealthDerive';
export { cityState, type CityState, type MissingSessionGroup } from './decisionHealthState';

/**
 * Per-city health of the decision pipeline (issue #617 follow-up).
 *
 * Answers the questions the per-meeting decisions page cannot: how much of a
 * city is covered, what the source data looks like, and — for subjects with no
 * decision — whether the cause is ours or the municipality's.
 *
 * The layer is fetch-then-derive: `fetchDecisionFacts` pulls slim typed rows
 * with Prisma (a few thousand rows at production scale, measured 2026-09) and
 * pure functions in decisionHealthDerive.ts compute every metric, so each
 * business rule exists once and unit-tests without a database.
 *
 * Everything here reads normalised columns. `TaskStatus.responseBody` is
 * deliberately untouched: it is an unindexed JSON blob that can approach a
 * megabyte per poll, so it is only ever parsed for a single meeting on demand,
 * never aggregated (issue #303 was a payload-overflow crash of that shape).
 */

export interface CityDecisionHealth {
    cityId: string;
    cityName: string;
    cityNameEn: string;
    /** False for cities outside the Diavgeia realm — they are out of scope, not failing. */
    inScope: boolean;

    // Coverage
    meetings: number;
    polledMeetings: number;
    eligibleSubjects: number;
    linkedSubjects: number;

    // Waiting for a human
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

    /** Documents we hold and read but cannot attach to any meeting. */
    unplaceable: Record<UnplaceableKind, number> & { total: number };

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

    lastPollAt: Date | null;
}

// --- Shared facts fetch (used here and in decisionHealthDetail) ---

const cityFactsSelect = {
    id: true, name: true, name_en: true, diavgeiaUid: true, timezone: true,
} satisfies Prisma.CitySelect;
type CityFacts = Prisma.CityGetPayload<{ select: typeof cityFactsSelect }>;

const meetingFactsSelect = {
    id: true, cityId: true, name: true, dateTime: true,
    subjects: {
        where: DECISION_ELIGIBLE_SUBJECT_WHERE,
        select: { id: true, name: true, decision: { select: { id: true } } },
    },
} satisfies Prisma.CouncilMeetingSelect;
type MeetingRow = Prisma.CouncilMeetingGetPayload<{ select: typeof meetingFactsSelect }>;

export type MeetingFacts = Omit<MeetingRow, 'subjects'> & {
    /** City-local calendar date, computed once with the city's timezone. */
    localDate: string;
    /** The meeting's decision-eligible subjects, with link status. */
    subjects: Array<{ id: string; name: string; linked: boolean }>;
};

const candidateFactsSelect = {
    id: true, cityId: true, councilMeetingId: true, subjectId: true,
    decisionId: true, dismissedAt: true, readStatus: true, meetingDate: true,
    ada: true, decisionNumber: true, title: true, pdfUrl: true,
} satisfies Prisma.DecisionCandidateSelect;
export type CandidateFacts = Prisma.DecisionCandidateGetPayload<{ select: typeof candidateFactsSelect }>;

const pollFactsSelect = {
    cityId: true, councilMeetingId: true, status: true, createdAt: true,
} satisfies Prisma.TaskStatusSelect;
type PollFacts = Prisma.TaskStatusGetPayload<{ select: typeof pollFactsSelect }>;

const linkedSubjectSelect = {
    subject: { select: { name: true, cityId: true, councilMeetingId: true } },
} satisfies Prisma.DecisionSelect;

export interface DecisionFacts {
    cities: CityFacts[];
    /** Every meeting of the scope — including Λογοδοσία and future sessions,
     * which the orphan gap search needs; coverage filters them out itself. */
    meetings: MeetingFacts[];
    /** (city, meeting, name) keys of subjects holding a decision — any subject,
     * eligible or not, so a withdrawn twin still counts as a duplicate. */
    linkedSubjectNameKeys: Set<string>;
    /** Subjects whose decision carries its excerpt. */
    excerptSubjectIds: Set<string>;
    candidates: CandidateFacts[];
    /** Latest poll per meeting (key: meetingKey) — a failed latest poll is queue work. */
    latestPollByMeeting: Map<string, PollFacts>;
    /** Meetings with at least one succeeded poll (key: meetingKey). */
    succeededPollMeetings: Set<string>;
    lastPollAtByCity: Map<string, Date>;
}

/**
 * One slim fetch of everything the health rollups and the city detail derive
 * from. Hardcoded to the Greek realm for now: Diavgeia is a Greek register.
 */
export async function fetchDecisionFacts(cityId?: string): Promise<DecisionFacts> {
    const [cities, meetingRows, linkedRows, excerptRows, candidates, polls] = await Promise.all([
        prisma.city.findMany({
            where: { realm: 'greece', ...(cityId ? { id: cityId } : {}) },
            select: cityFactsSelect,
        }),
        prisma.councilMeeting.findMany({
            where: cityId ? { cityId } : { city: { realm: 'greece' } },
            select: meetingFactsSelect,
        }),
        prisma.decision.findMany({
            where: cityId ? { subject: { cityId } } : {},
            select: linkedSubjectSelect,
        }),
        prisma.decision.findMany({
            where: { excerpt: { not: null }, ...(cityId ? { subject: { cityId } } : {}) },
            select: { subjectId: true },
        }),
        prisma.decisionCandidate.findMany({
            where: cityId ? { cityId } : {},
            select: candidateFactsSelect,
        }),
        prisma.taskStatus.findMany({
            where: { type: 'pollDecisions', ...(cityId ? { cityId } : {}) },
            select: pollFactsSelect,
        }),
    ]);

    const tzByCity = new Map(cities.map(c => [c.id, c.timezone]));
    const meetings: MeetingFacts[] = meetingRows
        // A cityId outside the realm has no timezone entry and yields no rows,
        // matching the realm filter of the all-cities path.
        .filter(m => tzByCity.has(m.cityId))
        .map(m => ({
            id: m.id, cityId: m.cityId, name: m.name, dateTime: m.dateTime,
            localDate: localCalendarDate(m.dateTime, tzByCity.get(m.cityId)!),
            subjects: m.subjects.map(s => ({ id: s.id, name: s.name, linked: s.decision !== null })),
        }));

    const latestPollByMeeting = new Map<string, PollFacts>();
    const succeededPollMeetings = new Set<string>();
    const lastPollAtByCity = new Map<string, Date>();
    for (const p of polls) {
        const key = meetingKey(p.cityId, p.councilMeetingId);
        const current = latestPollByMeeting.get(key);
        if (!current || p.createdAt > current.createdAt) {
            latestPollByMeeting.set(key, p);
        }
        if (p.status === 'succeeded') succeededPollMeetings.add(key);
        const last = lastPollAtByCity.get(p.cityId);
        if (!last || p.createdAt > last) lastPollAtByCity.set(p.cityId, p.createdAt);
    }

    return {
        cities,
        meetings,
        linkedSubjectNameKeys: new Set(linkedRows.map(r =>
            subjectNameKey(r.subject.cityId, r.subject.councilMeetingId, r.subject.name))),
        excerptSubjectIds: new Set(excerptRows.map(r => r.subjectId)),
        candidates,
        latestPollByMeeting,
        succeededPollMeetings,
        lastPollAtByCity,
    };
}

/** True for the candidate rows that form the unplaced work queue of a meeting. */
export const isUnplacedQueueCandidate = (c: CandidateFacts): boolean =>
    c.councilMeetingId !== null && c.decisionId === null && c.dismissedAt === null
    && c.readStatus !== 'not_a_decision';

/** True for read documents that declare a session we hold no meeting for. */
export const isReadOrphanCandidate = (c: CandidateFacts): boolean =>
    c.councilMeetingId === null && c.meetingDate !== null
    && c.readStatus !== 'unread' && c.readStatus !== 'not_a_decision';

/** Classifier plumbing shared by the overview counts and the detail lists,
 * so the two always feed the classifier the same facts. */
export function classifyUnmatchedIn(
    facts: DecisionFacts,
    stats: Map<string, MeetingCandidateStats>,
    meeting: MeetingFacts,
    subject: { name: string },
): UnmatchedCause {
    return classifyUnmatchedSubject(
        { cityId: meeting.cityId, councilMeetingId: meeting.id, name: subject.name },
        facts.linkedSubjectNameKeys,
        stats.get(meetingKey(meeting.cityId, meeting.id)),
    );
}

/**
 * The probable missing sessions of one city: orphan documents grouped by the
 * date their own first page declares. Ordered oldest first; documents within a
 * group by decision number.
 */
export async function getMissingSessionGroups(cityId: string): Promise<MissingSessionGroup[]> {
    return deriveMissingSessionGroups(await fetchDecisionFacts(cityId));
}

/**
 * Decision-number continuity showed the 1–3 day gap group are real extra
 * sessions (often emergency ones) missing from our data rather than misread
 * dates, so every gap bucket means "a session we do not have" — the buckets
 * themselves live in groupOrphanRows.
 */
export function deriveMissingSessionGroups(facts: DecisionFacts): MissingSessionGroup[] {
    const meetingDatesByCity = collectMeetingDatesByCity(facts.meetings);
    const rows = facts.candidates
        .filter(isReadOrphanCandidate)
        .map(c => ({
            date: declaredCalendarDate(c.meetingDate!),
            days: nearestMeetingGapDays(declaredCalendarDate(c.meetingDate!), meetingDatesByCity.get(c.cityId) ?? []),
            ada: c.ada, decisionNumber: c.decisionNumber, title: c.title, pdfUrl: c.pdfUrl,
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || compareDecisionNumbers(a.decisionNumber, b.decisionNumber));
    return groupOrphanRows(rows);
}

function collectMeetingDatesByCity(meetings: MeetingFacts[]): Map<string, string[]> {
    const byCity = new Map<string, string[]>();
    for (const m of meetings) {
        let dates = byCity.get(m.cityId);
        if (!dates) byCity.set(m.cityId, dates = []);
        dates.push(m.localDate);
    }
    return byCity;
}

/**
 * Health for every city with eligible subjects, or one city when `cityId` is given.
 * Cities outside the Diavgeia realm are returned with `inScope: false` so callers
 * can separate "out of scope" from "not started".
 *
 * `sinceDays` limits the meeting-derived numbers to the last N days — the
 * overview's signal view. Meetings
 * that have not happened yet never count, in any view. Work queues (unplaced,
 * unplaceable, conflicts, failed meetings) always count over all time, and a
 * city holding queue work is always in the result — pending work is never
 * hidden by the window. A city with neither in-window eligible meetings nor
 * queue work drops out.
 */
export async function getDecisionHealth(cityId?: string, sinceDays?: number): Promise<CityDecisionHealth[]> {
    const now = new Date();
    const [facts, conflictList] = await Promise.all([
        fetchDecisionFacts(cityId),
        // The exact conflict queue, shared with the detail view — the count is
        // the list's length, so the two can never drift apart.
        getConflictingCandidates(cityId ? { cityId } : undefined),
    ]);
    const stats = collectMeetingCandidateStats(facts.candidates);
    const meetingDatesByCity = collectMeetingDatesByCity(facts.meetings);

    const conflictsByCity = new Map<string, number>();
    for (const c of conflictList) {
        const id = c.claimingSubject.cityId;
        conflictsByCity.set(id, (conflictsByCity.get(id) ?? 0) + 1);
    }

    const failedByCity = new Map<string, number>();
    for (const latest of facts.latestPollByMeeting.values()) {
        if (latest.status === 'failed') {
            failedByCity.set(latest.cityId, (failedByCity.get(latest.cityId) ?? 0) + 1);
        }
    }

    const rows = facts.cities.map((city): CityDecisionHealth => ({
        cityId: city.id,
        cityName: city.name,
        cityNameEn: city.name_en,
        inScope: city.diavgeiaUid !== null,
        meetings: 0, polledMeetings: 0, eligibleSubjects: 0, linkedSubjects: 0,
        unplacedCandidates: 0, unplacedUnread: 0,
        conflicts: conflictsByCity.get(city.id) ?? 0,
        failedMeetings: failedByCity.get(city.id) ?? 0,
        unplaceable: { sameDayOtherBody: 0, nearbySessionMissing: 0, sessionUnknown: 0, total: 0 },
        contentLinks: 0,
        unmatchedTaxonomy: { notProcessed: 0, candidatesUnmatched: 0, nothingFetched: 0, duplicateSubject: 0 },
        lastPollAt: facts.lastPollAtByCity.get(city.id) ?? null,
    }));
    const rowByCity = new Map(rows.map(r => [r.cityId, r]));

    // Coverage, link quality and the taxonomy — the windowed measurements.
    for (const m of facts.meetings) {
        if (isLogodosiaMeeting(m.name)) continue;
        if (!isInMeasurementWindow(m.dateTime, sinceDays ?? null, now)) continue;
        if (m.subjects.length === 0) continue;
        const row = rowByCity.get(m.cityId)!;
        row.meetings += 1;
        if (facts.succeededPollMeetings.has(meetingKey(m.cityId, m.id))) row.polledMeetings += 1;
        row.eligibleSubjects += m.subjects.length;
        for (const s of m.subjects) {
            if (s.linked) {
                row.linkedSubjects += 1;
                if (facts.excerptSubjectIds.has(s.id)) row.contentLinks += 1;
            } else {
                row.unmatchedTaxonomy[classifyUnmatchedIn(facts, stats, m, s)] += 1;
            }
        }
    }

    // Work queues — always all-time.
    for (const c of facts.candidates) {
        const row = rowByCity.get(c.cityId);
        if (!row) continue;
        if (isUnplacedQueueCandidate(c)) {
            row.unplacedCandidates += 1;
            if (c.readStatus === 'unread') row.unplacedUnread += 1;
        } else if (isReadOrphanCandidate(c)) {
            const days = nearestMeetingGapDays(
                declaredCalendarDate(c.meetingDate!), meetingDatesByCity.get(c.cityId) ?? []);
            row.unplaceable[unplaceableKind(days)] += 1;
            row.unplaceable.total += 1;
        }
    }

    // A city with neither in-window eligible meetings nor queue work drops out.
    // Unread backfill rows are a count, not triage work, so they hold no city.
    const kept = rows.filter(r =>
        r.eligibleSubjects > 0
        || r.unplacedCandidates - r.unplacedUnread > 0
        || r.unplaceable.total > 0
        || r.conflicts > 0
        || r.failedMeetings > 0);

    // Busiest first; queue-only rows (no in-window coverage) follow.
    return kept.sort((a, b) =>
        b.eligibleSubjects - a.eligibleSubjects || a.cityId.localeCompare(b.cityId));
}
