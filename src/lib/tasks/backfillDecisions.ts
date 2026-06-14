import prisma from "@/lib/db/prisma";
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from "@/lib/db/decisions";
import { LOGODOSIA_NAME_PATTERN } from "@/lib/tasks/pollDecisionsBackoff";
import { pollDecisionsForMeeting } from "@/lib/tasks/pollDecisions";
import {
    selectBackfillMeetings,
    type BackfillCandidate,
} from "@/lib/tasks/backfillDecisionsSelection";

export {
    selectBackfillMeetings,
    type BackfillCandidate,
    type BackfillSelectionOptions,
    type BackfillDecision,
} from "@/lib/tasks/backfillDecisionsSelection";

/**
 * One-time backfill of Diavgeia decisions for historical meetings.
 *
 * Unlike the cron (`pollDecisionsForRecentMeetings`), this ignores the 90-day
 * window and the progressive backoff: decisions for old meetings are long
 * published on Diavgeia, so a single poll per meeting suffices.
 *
 * Safety model (because `startTask` does NOT dedupe `pollDecisions` — it always
 * fires a real backend call):
 *   - The runner is DRY-RUN by default; nothing is dispatched without `execute`.
 *   - Selection skips meetings recently polled (succeeded within `skipRecentDays`)
 *     and meetings with an in-progress poll, so re-runs / overlaps don't
 *     re-dispatch the same meeting.
 *   - Dispatch is rate-limited (sequential within batches, delay between batches).
 */

// ─── Runner (DB + dispatch) ──────────────────────────────────────────

export interface BackfillRunOptions {
    /** When false (default), dry-run: nothing is dispatched. */
    execute?: boolean;
    /** Limit to a single city. */
    cityId?: string;
    /** Max meetings to dispatch per batch (sequential within batch). */
    batchSize?: number;
    /** Pause between batches, in ms (rate limit). */
    batchDelayMs?: number;
    /** Skip meetings whose last succeeded poll is within this many days. */
    skipRecentDays?: number;
    /** Cap the number of candidate meetings considered (for trial runs). */
    limit?: number;
    /** Logger sink — defaults to console.log. */
    log?: (message: string) => void;
}

export interface BackfillRunResult {
    citiesWithDiavgeia: number;
    citiesWithoutDiavgeia: string[];
    candidateCount: number;
    toDispatch: number;
    skippedByReason: Record<string, number>;
    dispatched: number;
    failed: number;
    executed: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs the backfill. Dry-run by default; pass `execute: true` to dispatch.
 * Callers (CLI) are responsible for prod guards and auth — this function does
 * not check either, matching `pollDecisionsForMeeting`.
 */
export async function runBackfill(options: BackfillRunOptions = {}): Promise<BackfillRunResult> {
    const {
        execute = false,
        cityId,
        batchSize = 10,
        batchDelayMs = 2000,
        skipRecentDays = 7,
        limit,
        log = (m: string) => console.log(m),
    } = options;

    // Side-output: cities that cannot be polled until configured.
    const citiesWithoutDiavgeia = await prisma.city.findMany({
        where: { diavgeiaUid: null, ...(cityId ? { id: cityId } : {}) },
        select: { id: true },
        orderBy: { id: "asc" },
    });

    const citiesWithDiavgeia = await prisma.city.count({
        where: { diavgeiaUid: { not: null }, ...(cityId ? { id: cityId } : {}) },
    });

    // Candidate meetings: configured city, not Λογοδοσία, with at least one
    // eligible subject lacking a decision.
    const meetings = await prisma.councilMeeting.findMany({
        where: {
            ...(cityId ? { cityId } : {}),
            city: { diavgeiaUid: { not: null } },
            NOT: { name: { contains: LOGODOSIA_NAME_PATTERN } },
            subjects: {
                some: { ...DECISION_ELIGIBLE_SUBJECT_WHERE, decision: null },
            },
        },
        select: { id: true, cityId: true, name: true, dateTime: true },
        orderBy: { dateTime: "asc" }, // oldest first
        ...(limit ? { take: limit } : {}),
    });

    if (meetings.length === 0) {
        log("No candidate meetings found.");
        return {
            citiesWithDiavgeia,
            citiesWithoutDiavgeia: citiesWithoutDiavgeia.map((c) => c.id),
            candidateCount: 0,
            toDispatch: 0,
            skippedByReason: {},
            dispatched: 0,
            failed: 0,
            executed: execute,
        };
    }

    const meetingIds = meetings.map((m) => m.id);

    // Eligible subject counts per meeting.
    const eligibleCounts = await prisma.subject.groupBy({
        by: ["councilMeetingId", "cityId"],
        where: { councilMeetingId: { in: meetingIds }, ...DECISION_ELIGIBLE_SUBJECT_WHERE },
        _count: true,
    });
    const eligibleByMeeting = new Map(
        eligibleCounts.map((r) => [`${r.cityId}:${r.councilMeetingId}`, r._count]),
    );

    // Linked decision counts per meeting (eligible subjects with a decision).
    const linkedCounts = await prisma.subject.groupBy({
        by: ["councilMeetingId", "cityId"],
        where: {
            councilMeetingId: { in: meetingIds },
            ...DECISION_ELIGIBLE_SUBJECT_WHERE,
            decision: { isNot: null },
        },
        _count: true,
    });
    const linkedByMeeting = new Map(
        linkedCounts.map((r) => [`${r.cityId}:${r.councilMeetingId}`, r._count]),
    );

    // Last succeeded poll per meeting.
    const succeededPolls = await prisma.taskStatus.groupBy({
        by: ["councilMeetingId", "cityId"],
        where: { councilMeetingId: { in: meetingIds }, type: "pollDecisions", status: "succeeded" },
        _max: { createdAt: true },
    });
    const lastPollByMeeting = new Map(
        succeededPolls.map((r) => [`${r.cityId}:${r.councilMeetingId}`, r._max.createdAt]),
    );

    // In-progress polls per meeting (pending/running — anything not terminal).
    const inProgressPolls = await prisma.taskStatus.findMany({
        where: {
            councilMeetingId: { in: meetingIds },
            type: "pollDecisions",
            status: { notIn: ["succeeded", "failed"] },
        },
        select: { councilMeetingId: true, cityId: true },
        distinct: ["councilMeetingId", "cityId"],
    });
    const inProgressByMeeting = new Set(
        inProgressPolls.map((r) => `${r.cityId}:${r.councilMeetingId}`),
    );

    const candidates: BackfillCandidate[] = meetings.map((m) => {
        const key = `${m.cityId}:${m.id}`;
        return {
            cityId: m.cityId,
            meetingId: m.id,
            meetingName: m.name,
            dateTime: m.dateTime,
            eligibleSubjectCount: eligibleByMeeting.get(key) ?? 0,
            linkedDecisionCount: linkedByMeeting.get(key) ?? 0,
            lastSucceededPollAt: lastPollByMeeting.get(key) ?? null,
            hasInProgressPoll: inProgressByMeeting.has(key),
        };
    });

    const selection = selectBackfillMeetings(candidates, { skipRecentDays });

    const skippedByReason: Record<string, number> = {};
    for (const d of selection) {
        if (!d.dispatch && d.skipReason) {
            skippedByReason[d.skipReason] = (skippedByReason[d.skipReason] ?? 0) + 1;
        }
    }
    const dispatchList = selection.filter((d) => d.dispatch);

    // ── Summary ──
    log(`Cities with diavgeiaUid:    ${citiesWithDiavgeia}`);
    log(`Cities WITHOUT diavgeiaUid: ${citiesWithoutDiavgeia.length}`);
    if (citiesWithoutDiavgeia.length > 0) {
        log(`  (need manual config): ${citiesWithoutDiavgeia.map((c) => c.id).join(", ")}`);
    }
    log(`Candidate meetings:         ${candidates.length}`);
    log(`To dispatch:                ${dispatchList.length}`);
    log(`Skipped:                    ${candidates.length - dispatchList.length}`);
    for (const [reason, count] of Object.entries(skippedByReason)) {
        log(`  - ${reason}: ${count}`);
    }

    if (!execute) {
        log("");
        log("DRY RUN — nothing dispatched. Re-run with --execute to dispatch.");
        const preview = dispatchList.slice(0, 10);
        if (preview.length > 0) {
            log(`First ${preview.length} meeting(s) that would be dispatched:`);
            for (const d of preview) {
                log(
                    `  ${d.candidate.cityId}/${d.candidate.meetingId} ` +
                    `(${d.candidate.dateTime.toISOString().split("T")[0]}) ` +
                    `${d.candidate.linkedDecisionCount}/${d.candidate.eligibleSubjectCount} linked`,
                );
            }
        }
        return {
            citiesWithDiavgeia,
            citiesWithoutDiavgeia: citiesWithoutDiavgeia.map((c) => c.id),
            candidateCount: candidates.length,
            toDispatch: dispatchList.length,
            skippedByReason,
            dispatched: 0,
            failed: 0,
            executed: false,
        };
    }

    // ── Execute: dispatch sequentially in rate-limited batches ──
    log("");
    log(`EXECUTING — dispatching ${dispatchList.length} poll(s) in batches of ${batchSize} ` +
        `(${batchDelayMs}ms between batches)...`);

    let dispatched = 0;
    let failed = 0;

    for (let i = 0; i < dispatchList.length; i += batchSize) {
        const batch = dispatchList.slice(i, i + batchSize);
        for (const d of batch) {
            try {
                await pollDecisionsForMeeting(d.candidate.cityId, d.candidate.meetingId, {
                    silent: true,
                });
                dispatched++;
                log(`  dispatched ${d.candidate.cityId}/${d.candidate.meetingId}`);
            } catch (error) {
                failed++;
                const msg = error instanceof Error ? error.message : String(error);
                log(`  FAILED ${d.candidate.cityId}/${d.candidate.meetingId}: ${msg}`);
            }
        }
        const remaining = dispatchList.length - (i + batch.length);
        if (remaining > 0 && batchDelayMs > 0) {
            log(`  ...batch done (${dispatched} dispatched, ${failed} failed, ${remaining} remaining). ` +
                `Waiting ${batchDelayMs}ms.`);
            await sleep(batchDelayMs);
        }
    }

    log("");
    log(`Done. Dispatched: ${dispatched}, Failed: ${failed}.`);

    return {
        citiesWithDiavgeia,
        citiesWithoutDiavgeia: citiesWithoutDiavgeia.map((c) => c.id),
        candidateCount: candidates.length,
        toDispatch: dispatchList.length,
        skippedByReason,
        dispatched,
        failed,
        executed: true,
    };
}
