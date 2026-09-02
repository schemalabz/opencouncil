import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { localCalendarDate } from '../formatters/time';
import { isLogodosiaMeeting } from '../tasks/pollDecisionsBackoff';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from './decisionEligibility';
import { getConflictingCandidates } from './decisionCandidates';
import { groupOrphanRows, unplaceableKind } from './decisionHealthState';
import type { MissingSessionGroup, UnplaceableKind } from './decisionHealthState';
import {
    accumulateMeeting, bodyKey, classifyUnmatchedSubject, collectMeetingCandidateStats, compareBodyRows,
    compareDecisionNumbers, declaredCalendarDate, emptyCoverage, emptyMeetingQueues, isInMeasurementWindow,
    meetingKey, nearestMeetingGapDays, subjectNameKey,
    type CoverageMeasures, type MeasuredMeeting, type MeasuredSubject, type MeetingCandidateStats, type MeetingQueues,
    type UnmatchedCause,
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

/** One administrative body of a city, or (`body: null`) its meetings that carry no body. */
export interface BodyDecisionHealth extends CoverageMeasures, MeetingQueues {
    body: BodyFacts | null;
}

export interface CityDecisionHealth extends CoverageMeasures, MeetingQueues {
    cityId: string;
    cityName: string;
    cityNameEn: string;
    /** False for cities outside the Diavgeia realm — they are out of scope, not failing. */
    inScope: boolean;
    diavgeiaUid: string | null;

    /**
     * Every administrative body of the city, plus a trailing no-body row when
     * the city's meetings without a body have something to show: eligible
     * subjects at any time, or coverage or queue work now. Ordered by
     * compareBodyRows; the rows sum to the city's own coverage and queue fields.
     */
    bodies: BodyDecisionHealth[];

    /** Documents we hold and read but cannot attach to any meeting. */
    unplaceable: Record<UnplaceableKind, number> & { total: number };

    lastPollAt: Date | null;
}

// --- Shared facts fetch (used here and in decisionHealthDetail) ---

const cityFactsSelect = {
    id: true, name: true, name_en: true, diavgeiaUid: true, timezone: true,
    administrativeBodies: {
        select: { id: true, name: true, name_en: true, type: true, diavgeiaUnitIds: true },
    },
} satisfies Prisma.CitySelect;
type CityFacts = Prisma.CityGetPayload<{ select: typeof cityFactsSelect }>;
type BodyFacts = CityFacts['administrativeBodies'][number];

const meetingFactsSelect = {
    id: true, cityId: true, administrativeBodyId: true, name: true, dateTime: true,
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
            id: m.id, cityId: m.cityId, administrativeBodyId: m.administrativeBodyId,
            name: m.name, dateTime: m.dateTime,
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

/** Resolves one meeting's facts into the shape the accumulator folds — once per meeting, whatever the scope count. */
function measureMeeting(
    facts: DecisionFacts, stats: Map<string, MeetingCandidateStats>, m: MeetingFacts,
): MeasuredMeeting {
    return {
        polled: facts.succeededPollMeetings.has(meetingKey(m.cityId, m.id)),
        subjects: m.subjects.map((s): MeasuredSubject => s.linked
            ? { linked: true, content: facts.excerptSubjectIds.has(s.id) }
            : { linked: false, cause: classifyUnmatchedIn(facts, stats, m, s) }),
    };
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

    // The no-body row exists while folding wherever a body-less meeting exists,
    // so every meeting has a row to land in; it is dropped afterwards when it
    // shows nothing (a presentation without eligible subjects is not polled).
    const citiesWithBodylessMeetings = new Set(
        facts.meetings.filter(m => m.administrativeBodyId === null).map(m => m.cityId));
    const citiesWithEligibleBodylessMeetings = new Set(
        facts.meetings.filter(m => m.administrativeBodyId === null && m.subjects.length > 0).map(m => m.cityId));

    const rows = facts.cities.map((city): CityDecisionHealth => ({
        cityId: city.id,
        cityName: city.name,
        cityNameEn: city.name_en,
        inScope: city.diavgeiaUid !== null,
        diavgeiaUid: city.diavgeiaUid,
        ...emptyCoverage(),
        ...emptyMeetingQueues(),
        bodies: [
            ...city.administrativeBodies.map((body): BodyDecisionHealth => ({ body, ...emptyCoverage(), ...emptyMeetingQueues() })),
            ...(citiesWithBodylessMeetings.has(city.id) ? [{ body: null, ...emptyCoverage(), ...emptyMeetingQueues() }] : []),
        ].sort(compareBodyRows),
        unplaceable: { sameDayOtherBody: 0, nearbySessionMissing: 0, sessionUnknown: 0, total: 0 },
        lastPollAt: facts.lastPollAtByCity.get(city.id) ?? null,
    }));
    const rowByCity = new Map(rows.map(r => [r.cityId, r]));
    const bodyRowByKey = new Map<string, BodyDecisionHealth>();
    for (const r of rows) {
        for (const b of r.bodies) bodyRowByKey.set(bodyKey(r.cityId, b.body?.id ?? null), b);
    }
    const bodyIdByMeeting = new Map(facts.meetings.map(m => [meetingKey(m.cityId, m.id), m.administrativeBodyId]));
    // The schema does not pin a meeting's body to the meeting's city, so a
    // cross-city reference misses here. Such a meeting counts for the city
    // and for no body; the page must not crash on it.
    const bodyRowOfMeeting = (cityId: string, councilMeetingId: string): BodyDecisionHealth | undefined => {
        const key = meetingKey(cityId, councilMeetingId);
        return bodyIdByMeeting.has(key) ? bodyRowByKey.get(bodyKey(cityId, bodyIdByMeeting.get(key)!)) : undefined;
    };

    // Coverage, link quality and the taxonomy — the windowed measurements,
    // measured once per meeting and folded into the city and its body.
    for (const m of facts.meetings) {
        if (isLogodosiaMeeting(m.name)) continue;
        if (!isInMeasurementWindow(m.dateTime, sinceDays ?? null, now)) continue;
        if (m.subjects.length === 0) continue;
        const measured = measureMeeting(facts, stats, m);
        accumulateMeeting(rowByCity.get(m.cityId)!, measured);
        const bodyRow = bodyRowOfMeeting(m.cityId, m.id);
        if (bodyRow) accumulateMeeting(bodyRow, measured);
    }

    // Work queues — always all-time, folded into the city and its body alike.
    for (const c of conflictList) {
        const { cityId: id, councilMeetingId } = c.claimingSubject;
        const row = rowByCity.get(id);
        if (!row) continue;
        row.conflicts += 1;
        const bodyRow = bodyRowOfMeeting(id, councilMeetingId);
        if (bodyRow) bodyRow.conflicts += 1;
    }
    for (const latest of facts.latestPollByMeeting.values()) {
        if (latest.status !== 'failed') continue;
        const row = rowByCity.get(latest.cityId);
        if (!row) continue;
        row.failedMeetings += 1;
        const bodyRow = bodyRowOfMeeting(latest.cityId, latest.councilMeetingId);
        if (bodyRow) bodyRow.failedMeetings += 1;
    }
    for (const c of facts.candidates) {
        const row = rowByCity.get(c.cityId);
        if (!row) continue;
        if (isUnplacedQueueCandidate(c)) {
            row.unplacedCandidates += 1;
            if (c.readStatus === 'unread') row.unplacedUnread += 1;
            const bodyRow = bodyRowOfMeeting(c.cityId, c.councilMeetingId!);
            if (bodyRow) {
                bodyRow.unplacedCandidates += 1;
                if (c.readStatus === 'unread') bodyRow.unplacedUnread += 1;
            }
        } else if (isReadOrphanCandidate(c)) {
            const days = nearestMeetingGapDays(
                declaredCalendarDate(c.meetingDate!), meetingDatesByCity.get(c.cityId) ?? []);
            row.unplaceable[unplaceableKind(days)] += 1;
            row.unplaceable.total += 1;
        }
    }

    for (const r of rows) {
        r.bodies = r.bodies.filter(b => b.body !== null
            || citiesWithEligibleBodylessMeetings.has(r.cityId)
            || b.meetings > 0 || b.unplacedCandidates > 0 || b.conflicts > 0 || b.failedMeetings > 0);
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
