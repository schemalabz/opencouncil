"use server";

import { PollDecisionsRequest, PollDecisionsResult, PollDecisionsMatch, ExtractedDecisionData } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { AttendanceStatus, DataSource, VoteType, Prisma } from "@prisma/client";
import { sortSubjectsByDiscussionOrder } from "../minutes/builders";

import { upsertDecision, deleteDecision, getDecisionForSubject, DECISION_ELIGIBLE_SUBJECT_WHERE } from "../db/decisions";
export { getDecisionForSubject };
import { getCurrentUser, withUserAuthorizedToEdit } from "../auth";
import { getPeopleForMeeting } from "../db/people";
import { deriveWindowDays } from "./decisionWindow";
import { localCalendarDate } from "@/lib/formatters/time";
import { applyCandidateConflictResolution, getUnresolvedCandidatesForMeeting } from "../db/decisionCandidates";
import { isRoleActiveAt, isMayorRole } from "../utils/roles";
import { shouldSkipPolling, getBackoffState, getPollableMeetingDateRange, isLogodosiaMeeting, LOGODOSIA_NAME_PATTERN, type BackoffTier } from "./pollDecisionsBackoff";
import { interleaveByCity } from "./pollableMeetings";
import { sendPollDecisionsBatchStartedAlert, sendPollDecisionsBatchCompletedAlert } from "../discord";
import { agendaItemTitleOrName } from "@/lib/utils/subjects";

export async function requestPollDecisions(
    cityId: string,
    councilMeetingId: string,
    options?: { forceExtract?: boolean },
) {
    await withUserAuthorizedToEdit({ cityId });

    // The plain poll stays city-admin: a manual link starts extraction
    // automatically through this path. Cache-busting re-extraction is a
    // superadmin cost operation, matching the decisions-page UI tiering.
    if (options?.forceExtract) {
        const user = await getCurrentUser();
        if (!user?.isSuperAdmin) {
            throw new Error('Superadmin required for forced re-extraction');
        }
    }

    return pollDecisionsForMeeting(cityId, councilMeetingId, options);
}

/**
 * Core function to poll decisions for a meeting. Used by both the admin action and the cron job.
 * Does NOT check authorization — callers are responsible for auth.
 *
 * @param options.silent - When true, suppresses the per-task "started" Discord alert (used by cron batch)
 * @param options.forceExtract - When true, skips extraction cache and reprocesses all PDFs
 */
export async function pollDecisionsForMeeting(
    cityId: string,
    councilMeetingId: string,
    options?: { silent?: boolean; forceExtract?: boolean },
) {
    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                id: councilMeetingId,
                cityId,
            },
        },
        include: {
            city: {
                select: {
                    diavgeiaUid: true,
                    timezone: true,
                },
            },
            administrativeBody: {
                select: {
                    id: true,
                    name: true,
                    diavgeiaUnitIds: true,
                },
            },
            subjects: {
                select: {
                    id: true,
                    name: true,
                    agendaItemTitle: true,
                    agendaItemIndex: true,
                    nonAgendaReason: true,
                    discussedIn: { select: { id: true } },
                    decision: { select: { ada: true, title: true, pdfUrl: true, excerpt: true } },
                },
                where: DECISION_ELIGIBLE_SUBJECT_WHERE,
            },
        },
    });

    if (!councilMeeting) {
        throw new Error("Council meeting not found");
    }

    if (!councilMeeting.city.diavgeiaUid) {
        throw new Error("City does not have a Diavgeia UID configured");
    }

    if (councilMeeting.subjects.length === 0) {
        throw new Error("No eligible subjects to poll (subjects must have agendaItemIndex or be outOfAgenda, and not be withdrawn)");
    }

    // Fetch people for name matching during extraction
    const people = await getPeopleForMeeting(cityId, councilMeeting.administrativeBody?.id ?? null);
    const peopleForRequest = people.map(p => ({ id: p.id, name: p.name }));

    // Find the city mayor for presence extraction from decision narrative
    const mayorPerson = people.find(p =>
        p.roles.some(r => isMayorRole(r) && isRoleActiveAt(r, councilMeeting.dateTime))
    );

    // Sort subjects by discussion order (transcript timestamps) so OA subjects
    // are in the correct sequence. Uses the same sortSubjectsByDiscussionOrder
    // used by the minutes renderer.
    const subjectIds = councilMeeting.subjects.map(s => s.id);
    const firstUtteranceBySubject = new Map<string, number>();
    if (subjectIds.length > 0) {
        const firstUtterances = await prisma.utterance.groupBy({
            by: ['discussionSubjectId'],
            where: { discussionSubjectId: { in: subjectIds } },
            _min: { startTimestamp: true },
        });
        for (const u of firstUtterances) {
            if (u.discussionSubjectId && u._min.startTimestamp != null) {
                firstUtteranceBySubject.set(u.discussionSubjectId, u._min.startTimestamp);
            }
        }
    }
    const sortedSubjects = sortSubjectsByDiscussionOrder(councilMeeting.subjects, firstUtteranceBySubject);

    // Window from the city's measured publication lags; the declared session
    // date does the precise work, the window only has to be wide enough.
    const lagRows = await prisma.decision.findMany({
        where: { publishDate: { not: null }, subject: { cityId } },
        select: { publishDate: true, subject: { select: { councilMeeting: { select: { dateTime: true } } } } },
    });
    const windowDays = deriveWindowDays(lagRows.map(r =>
        (r.publishDate!.getTime() - r.subject.councilMeeting.dateTime.getTime()) / 86_400_000));
    const cityTz = councilMeeting.city.timezone;
    const windowFromDate = localCalendarDate(councilMeeting.dateTime, cityTz);
    const windowToDate = localCalendarDate(new Date(councilMeeting.dateTime.getTime() + windowDays * 86400_000), cityTz);

    // Everything the city has already read whose publishDate falls in this
    // window — mostly neighbouring meetings' decisions, which is the point.
    const known = await prisma.decisionCandidate.findMany({
        where: {
            cityId,
            publishDate: { gte: new Date(windowFromDate), lte: new Date(`${windowToDate}T23:59:59Z`) },
        },
        select: { ada: true, meetingDate: true, readStatus: true },
    });

    const body: Omit<PollDecisionsRequest, 'callbackUrl'> = {
        // City-local: documents print local dates, and the partition compares
        // against this value. The UTC date is the previous day for meetings
        // stored at local midnight.
        meetingDate: localCalendarDate(councilMeeting.dateTime, cityTz),
        diavgeiaUid: councilMeeting.city.diavgeiaUid,
        diavgeiaUnitIds: councilMeeting.administrativeBody?.diavgeiaUnitIds.length
            ? councilMeeting.administrativeBody.diavgeiaUnitIds
            : undefined,
        administrativeBodyName: councilMeeting.administrativeBody?.name ?? null,
        mayorId: mayorPerson?.id,
        forceExtract: options?.forceExtract || undefined,
        people: peopleForRequest,
        window: { fromDate: windowFromDate, toDate: windowToDate },
        knownDecisions: known.map(k => ({
            ada: k.ada,
            meetingDate: k.meetingDate ? k.meetingDate.toISOString().split('T')[0] : null,
            readStatus: k.readStatus,
        })),
        subjects: sortedSubjects.map(s => ({
            subjectId: s.id,
            name: agendaItemTitleOrName(s),
            agendaItemIndex: s.agendaItemIndex,
            nonAgendaReason: s.nonAgendaReason,
            ...(s.decision?.ada ? {
                existingDecision: {
                    ada: s.decision.ada,
                    decisionTitle: s.decision.title ?? '',
                    pdfUrl: s.decision.pdfUrl,
                    needsExtraction: !s.decision.excerpt, // linked but no extraction data
                },
            } : {}),
        })),
    };

    return startTask('pollDecisions', body, councilMeetingId, cityId, { silent: options?.silent });
}

/**
 * Polls decisions for recent meetings across all cities with Diavgeia configured.
 * Called by the cron endpoint. Finds meetings in the pollable date window
 * (see getPollableMeetingDateRange) that still have subjects without linked
 * decisions, and dispatches pollDecisions tasks for them.
 *
 * Uses progressive backoff based on time elapsed since the first poll for each
 * meeting (derived from TaskStatus records). This avoids endlessly polling meetings
 * whose subjects may never have decisions on Diavgeia. After MAX_POLLING_DAYS,
 * automatic polling stops — users can still trigger manual fetches from the
 * subject page.
 *
 * Limits to 10 dispatched tasks per invocation.
 */
export async function pollDecisionsForRecentMeetings() {
    // Find meetings in the pollable date window in cities with diavgeiaUid,
    // that have at least one subject with agendaItemIndex but no decision.
    // Λογοδοσία meetings are excluded — see isLogodosiaMeeting().
    const meetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: getPollableMeetingDateRange(),
            city: {
                diavgeiaUid: { not: null },
            },
            NOT: {
                name: { contains: LOGODOSIA_NAME_PATTERN },
            },
            subjects: {
                some: {
                    ...DECISION_ELIGIBLE_SUBJECT_WHERE,
                    decision: null,
                },
            },
        },
        select: {
            id: true,
            cityId: true,
        },
        orderBy: { dateTime: 'desc' },
        take: 200, // Fetch extra candidates since many may be skipped by backoff
    });

    if (meetings.length === 0) {
        return { meetingsProcessed: 0, results: [] };
    }

    // One backlogged city must not fill the whole batch — see interleaveByCity.
    const orderedMeetings = interleaveByCity(meetings);

    // Batch-fetch polling history for all candidate meetings in one query
    const pollHistory = await prisma.taskStatus.groupBy({
        by: ['councilMeetingId', 'cityId'],
        where: {
            councilMeetingId: { in: meetings.map(m => m.id) },
            type: 'pollDecisions',
            status: 'succeeded',
        },
        _count: true,
        _min: { createdAt: true },
        _max: { createdAt: true },
    });

    const historyByMeeting = new Map(
        pollHistory.map(h => [
            `${h.cityId}:${h.councilMeetingId}`,
            { count: h._count, firstPollAt: h._min.createdAt, lastPollAt: h._max.createdAt },
        ])
    );

    const results: Array<{ cityId: string; meetingId: string; status: string }> = [];
    let dispatched = 0;
    let skipped = 0;
    const dispatchedMeetings: Array<{ cityId: string; meetingId: string }> = [];
    const dispatchErrors: Array<{ cityId: string; meetingId: string; error: string }> = [];

    for (const meeting of orderedMeetings) {
        if (dispatched >= 10) break;

        const key = `${meeting.cityId}:${meeting.id}`;
        const history = historyByMeeting.get(key);

        const skipReason = shouldSkipPolling(
            history?.firstPollAt ?? null,
            history?.lastPollAt ?? null,
        );
        if (skipReason) {
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `skipped: ${skipReason}` });
            skipped++;
            continue;
        }

        try {
            await pollDecisionsForMeeting(
                meeting.cityId,
                meeting.id,
                { silent: true },
            );

            dispatched++;
            dispatchedMeetings.push({ cityId: meeting.cityId, meetingId: meeting.id });
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: 'started' });
        } catch (error) {
            console.error(`Failed to poll decisions for meeting ${meeting.cityId}/${meeting.id}:`, error);
            const errorMsg = (error as Error).message;
            dispatchErrors.push({ cityId: meeting.cityId, meetingId: meeting.id, error: errorMsg });
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `error: ${errorMsg}` });
        }
    }

    // Send a single batch started alert instead of per-task alerts.
    // .catch() ensures failures are logged — this is the sole observability path
    // for pollDecisions (discordAlertMode: 'none' suppresses all generic alerts).
    if (dispatched > 0 || dispatchErrors.length > 0) {
        sendPollDecisionsBatchStartedAlert({
            dispatchedCount: dispatched,
            skippedCount: skipped,
            meetings: dispatchedMeetings,
            errors: dispatchErrors,
        }).catch(err => console.error('Failed to send pollDecisions batch started alert:', err));
    }

    return { meetingsProcessed: dispatched, results };
}

/**
 * Server action: request a decision poll for a single subject.
 * Any user can trigger this (public-facing). Simple rate limiting via
 * checking for existing pending/running tasks within the last 5 minutes.
 */
export async function requestPollDecisionForSubject(subjectId: string): Promise<{
    status: 'requested' | 'already_running';
    taskId: string;
    cityId: string;
    meetingId: string;
}> {
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: {
            id: true,
            name: true,
            agendaItemIndex: true,
            cityId: true,
            councilMeetingId: true,
        },
    });

    if (!subject || subject.agendaItemIndex == null) {
        throw new Error("Subject not found or not eligible for decisions");
    }

    // Simple rate limit: check for existing pending/running pollDecisions task
    // for the same meeting within the last 5 minutes
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    const recentTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId: subject.councilMeetingId,
            cityId: subject.cityId,
            type: 'pollDecisions',
            status: { notIn: ['failed', 'succeeded'] },
            createdAt: { gte: fiveMinutesAgo },
        },
    });

    if (recentTask) {
        return {
            status: 'already_running',
            taskId: recentTask.id,
            cityId: subject.cityId,
            meetingId: subject.councilMeetingId,
        };
    }

    const task = await pollDecisionsForMeeting(
        subject.cityId,
        subject.councilMeetingId,
    );

    return {
        status: 'requested',
        taskId: task.id,
        cityId: subject.cityId,
        meetingId: subject.councilMeetingId,
    };
}

/**
 * Returns polling history and current backoff state for a specific meeting.
 * Used by the meeting decisions page to show polling status.
 */
export async function getPollingHistoryForMeeting(
    cityId: string,
    councilMeetingId: string
): Promise<{
    totalPolls: number;
    firstPollAt: string | null;
    lastPollAt: string | null;
    currentTier: BackoffTier | null;
    currentTierLabel: string | null;
    nextPollEligible: string | null;
}> {
    const history = await prisma.taskStatus.aggregate({
        where: {
            councilMeetingId,
            cityId,
            type: 'pollDecisions',
            status: 'succeeded',
        },
        _count: true,
        _min: { createdAt: true },
        _max: { createdAt: true },
    });

    const totalPolls = history._count;
    const firstPollAt = history._min.createdAt;
    const lastPollAt = history._max.createdAt;

    if (totalPolls === 0 || !firstPollAt || !lastPollAt) {
        return {
            totalPolls: 0,
            firstPollAt: null,
            lastPollAt: null,
            currentTier: null,
            currentTierLabel: null,
            nextPollEligible: null,
        };
    }

    const { currentTier, currentTierLabel, nextPollEligible } = getBackoffState(firstPollAt, lastPollAt);

    return {
        totalPolls,
        firstPollAt: firstPollAt.toISOString(),
        lastPollAt: lastPollAt.toISOString(),
        currentTier,
        currentTierLabel,
        nextPollEligible,
    };
}

/**
 * Returns the timestamp of the last successful pollDecisions task for a meeting.
 * Used to show "last searched" time on the subject page.
 */
export async function getLastPollTimeForMeeting(
    meetingId: string,
    cityId: string
): Promise<string | null> {
    const lastTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId: meetingId,
            cityId,
            type: 'pollDecisions',
            status: 'succeeded',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    });
    return lastTask?.createdAt.toISOString() ?? null;
}

export async function resolveCandidateConflict(
    candidateId: string,
    resolution: 'reassign' | 'dismiss',
) {
    const candidate = await prisma.decisionCandidate.findUnique({
        where: { id: candidateId },
        select: { cityId: true },
    });
    if (!candidate) {
        throw new Error('Candidate not found');
    }
    await withUserAuthorizedToEdit({ cityId: candidate.cityId });
    return applyCandidateConflictResolution(candidateId, resolution);
}

/** Per-meeting entry in the batch completion summary. */
export interface PollDecisionsMeetingResult {
    cityId: string;
    meetingId: string;
    matches: number;
    reassignments: number;
    conflicts: number;
    extractions: number;
    /** Session candidates left without a subject after this run — the admin triage pile. */
    unplaced: number;
    /** Unplaced candidates that carry a resolver suggestion — one click confirms them. */
    suggested: number;
    /** Subjects the resolver looked at and left without a decision. */
    unmatchedSubjects: number;
    /** Documents the reader could not use: unreadable + missing meeting date. */
    readIssues: number;
    status: 'succeeded' | 'failed';
    error?: string;
}

/** Max characters for an individual error line in batch Discord summaries. */
const ERROR_PREVIEW_LENGTH = 200;

/**
 * Radius (ms) for grouping pollDecisions tasks into a batch.
 * Tasks created within ±BATCH_WINDOW_MS of each other are considered siblings.
 *
 * Must be less than half the cron interval to avoid grouping tasks from
 * consecutive runs into the same batch. Current cron interval: 10 minutes.
 */
const BATCH_WINDOW_MS = 2 * 60 * 1000;

/**
 * After a pollDecisions task reaches a terminal state, check whether all sibling
 * tasks in the same batch window have also finished. If so, aggregate results
 * and send a single batch completion alert.
 *
 * Called via taskTerminalHooks in handleTaskUpdate — runs AFTER the task's DB
 * status is settled, so all statuses read from DB are correct.
 *
 * NOTE: Tasks that fail during startTask() (backend API errors) are set to
 * 'failed' directly without a callback, so handleTaskUpdate and this hook are
 * never invoked for them. Partial dispatch failures self-heal (surviving tasks
 * trigger this hook and find failed siblings via the time-window query). A
 * complete dispatch failure produces only a batch started alert — no completed
 * alert fires, since the started alert already shows the dispatch errors.
 */
export async function checkBatchCompletionAndAlert(
    _taskId: string,
    taskCreatedAt: Date,
) {
    const windowStart = new Date(taskCreatedAt.getTime() - BATCH_WINDOW_MS);
    const windowEnd = new Date(taskCreatedAt.getTime() + BATCH_WINDOW_MS);

    // Find all pollDecisions tasks in the time window
    const siblingTasks = await prisma.taskStatus.findMany({
        where: {
            type: 'pollDecisions',
            createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
            id: true,
            status: true,
            cityId: true,
            councilMeetingId: true,
            responseBody: true,
        },
    });

    // Check if all siblings are in terminal state.
    // Note: if two tasks complete nearly simultaneously, both may see allTerminal=true
    // and send a duplicate alert. This is a benign race — Discord duplicates are
    // preferable to missing alerts, and the window is very small in practice.
    const allTerminal = siblingTasks.every(t => t.status === 'succeeded' || t.status === 'failed');
    if (!allTerminal) {
        return; // Not all done yet — a later completion will trigger the summary
    }

    // Aggregate results — all tasks read uniformly from DB.
    let totalMatches = 0;
    let totalReassignments = 0;
    let totalConflicts = 0;
    let totalExtractions = 0;
    let totalUnplaced = 0;
    let totalSuggested = 0;
    let totalUnmatchedSubjects = 0;
    let totalReadIssues = 0;
    let succeededCount = 0;
    let failedCount = 0;
    const meetingBreakdown: PollDecisionsMeetingResult[] = [];

    for (const sibling of siblingTasks) {
        const cityId = sibling.cityId;
        const meetingId = sibling.councilMeetingId ?? 'unknown';

        if (sibling.status === 'failed') {
            failedCount++;
            meetingBreakdown.push({
                cityId,
                meetingId,
                matches: 0,
                reassignments: 0,
                conflicts: 0,
                extractions: 0,
                unplaced: 0,
                suggested: 0,
                unmatchedSubjects: 0,
                readIssues: 0,
                status: 'failed',
                error: sibling.responseBody?.substring(0, ERROR_PREVIEW_LENGTH) ?? undefined,
            });
            continue;
        }

        succeededCount++;

        // Parse responseBody for result counts. Prefer _processedCounts (enriched
        // after processing) for accurate post-processing numbers; fall back to raw
        // server response counts for older tasks or edge cases.
        let matches = 0;
        let reassignments = 0;
        let conflicts = 0;
        let extractions = 0;
        let unplaced = 0;
        let suggested = 0;
        let unmatchedSubjects = 0;
        let readIssues = 0;
        if (sibling.responseBody) {
            try {
                const parsed = JSON.parse(sibling.responseBody);
                if (parsed._processedCounts) {
                    matches = parsed._processedCounts.matches ?? 0;
                    reassignments = parsed._processedCounts.reassignments ?? 0;
                    conflicts = parsed._processedCounts.conflicts ?? 0;
                    extractions = parsed._processedCounts.extractions ?? 0;
                    unplaced = parsed._processedCounts.unplaced ?? 0;
                    suggested = parsed._processedCounts.suggested ?? 0;
                    unmatchedSubjects = parsed._processedCounts.unmatchedSubjects ?? 0;
                    readIssues = parsed._processedCounts.readIssues ?? 0;
                } else {
                    matches = Array.isArray(parsed.matches) ? parsed.matches.length : 0;
                    reassignments = Array.isArray(parsed.reassignments) ? parsed.reassignments.length : 0;
                }
            } catch { /* ignore parse errors */ }
        }
        totalMatches += matches;
        totalReassignments += reassignments;
        totalConflicts += conflicts;
        totalExtractions += extractions;
        totalUnplaced += unplaced;
        totalSuggested += suggested;
        totalUnmatchedSubjects += unmatchedSubjects;
        totalReadIssues += readIssues;
        meetingBreakdown.push({
            cityId,
            meetingId,
            matches,
            reassignments,
            conflicts,
            extractions,
            unplaced,
            suggested,
            unmatchedSubjects,
            readIssues,
            status: 'succeeded',
        });
    }

    sendPollDecisionsBatchCompletedAlert({
        succeededCount,
        failedCount,
        totalMatches,
        totalReassignments,
        totalConflicts,
        totalExtractions,
        totalUnplaced,
        totalSuggested,
        totalUnmatchedSubjects,
        totalReadIssues,
        meetingBreakdown,
    }).catch(err => console.error('Failed to send pollDecisions batch completed alert:', err));
}

/**
 * Record a conflicting match proposal on the ADA's candidate row.
 *
 * A proposal is evidence and must not vanish (before this rule, an existing
 * row swallowed it via `update: {}` — the "N conflicts" alert then pointed at
 * nothing). The candidate's own declared session decides:
 *
 * - The document declares the polled meeting's session, or was never read →
 *   record the proposal. On the holder's backing row this is a counter-proposal;
 *   the assignment (decisionId) is not touched.
 * - The document declares a different session → the claim contradicts the
 *   document itself: drop it, the count alone reports it.
 *
 * A human dismissal always freezes the row.
 */
async function recordConflictClaim(
    tx: Prisma.TransactionClient,
    cityId: string,
    councilMeetingId: string,
    polledLocalDate: string,
    match: PollDecisionsMatch,
): Promise<'recorded' | 'dropped'> {
    const ada = match.ada!;
    const proposal = {
        subjectId: match.subjectId,
        confidence: match.matchConfidence,
        reasoning: match.reasoning ?? null,
    };
    const existing = await tx.decisionCandidate.findUnique({
        where: { cityId_ada: { cityId, ada } },
        select: { meetingDate: true, readStatus: true, dismissedAt: true },
    });
    if (!existing) {
        await tx.decisionCandidate.create({
            data: {
                cityId,
                ada,
                title: match.decisionTitle ?? null,
                pdfUrl: match.pdfUrl,
                publishDate: match.publishDate ? new Date(match.publishDate) : null,
                protocolNumber: match.protocolNumber ?? null,
                readStatus: 'unread',
                councilMeetingId,
                ...proposal,
            },
        });
        return 'recorded';
    }
    if (existing.dismissedAt) return 'dropped';
    const declaresPolledSession = existing.readStatus === 'unread'
        || existing.meetingDate === null
        || polledLocalDate === ''
        || existing.meetingDate.toISOString().slice(0, 10) === polledLocalDate;
    if (!declaresPolledSession) return 'dropped';
    await tx.decisionCandidate.update({
        where: { cityId_ada: { cityId, ada } },
        data: proposal,
    });
    return 'recorded';
}

export async function handlePollDecisionsResult(taskId: string, result: PollDecisionsResult) {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const requestBody = JSON.parse(task.requestBody) as PollDecisionsRequest;
    const mayorId = requestBody.mayorId;

    let reassignmentCount = 0;
    let processedCount = 0;
    let conflictCount = 0;

    // Collect all subjectIds from matches and non-decision attendance for validation
    const allSubjectIds = [
        ...result.matches.map(m => m.subjectId),
        ...(result.extractions?.nonDecisionSubjectAttendance?.map(a => a.subjectId) ?? []),
    ];

    const validSubjectIds = await prisma.subject.findMany({
        where: {
            id: { in: allSubjectIds },
            cityId: task.cityId,
            councilMeetingId: task.councilMeetingId,
        },
        select: { id: true },
    });
    const validSubjectIdSet = new Set(validSubjectIds.map(s => s.id));

    if (result.reassignments?.length) {
        // The pipeline no longer moves confirmed links (issue #617). An older
        // tasks version proposed these; surface them and do nothing — a
        // Decision is only ever deleted by an admin.
        for (const r of result.reassignments) {
            console.warn(`Ignoring pipeline reassignment proposal for ${r.ada}: ${r.fromSubjectId} → ${r.toSubjectId} (${r.reason})`);
        }
    }

    const polledMeeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { id: task.councilMeetingId, cityId: task.cityId } },
        select: { dateTime: true, administrativeBodyId: true, city: { select: { timezone: true } } },
    });
    // The date the polled meeting's documents print — the conflict evidence
    // rule compares candidates' declared sessions against it.
    const polledLocalDate = polledMeeting
        ? localCalendarDate(polledMeeting.dateTime, polledMeeting.city.timezone)
        : '';

    await prisma.$transaction(async (tx) => {
        // Step 1: Detect ADA conflicts — find ADAs that already exist on other subjects
        const matchAdas = result.matches.map(m => m.ada).filter((ada): ada is string => ada != null);
        const existingDecisions = matchAdas.length > 0
            ? await tx.decision.findMany({ where: { ada: { in: matchAdas } }, select: { ada: true, subjectId: true } })
            : [];
        const adaToExistingSubject = new Map(existingDecisions.map(d => [d.ada!, d.subjectId]));

        // Step 2: Upsert new matches, recording conflicts
        for (const match of result.matches) {
            // Skip any subjectIds that don't belong to this meeting
            if (!validSubjectIdSet.has(match.subjectId)) {
                console.warn(`Poll decisions: skipping invalid subjectId ${match.subjectId} for task ${taskId}`);
                continue;
            }

            // Check for ADA conflict: ADA exists on a different subject and isn't being reassigned
            if (match.ada) {
                const existingSubjectId = adaToExistingSubject.get(match.ada);
                if (existingSubjectId && existingSubjectId !== match.subjectId) {
                    // Record the conflicting proposal on the candidate; skip the upsert.
                    // The join to the holding Decision is what surfaces the
                    // conflict in the admin views.
                    const outcome = await recordConflictClaim(tx, task.cityId, task.councilMeetingId, polledLocalDate, match);
                    conflictCount++;
                    console.log(`ADA conflict (${outcome}): ${match.ada} already belongs to subject ${existingSubjectId}, claimed by subject ${match.subjectId}`);
                    continue;
                }
            }

            // A match that changes a subject's ADA leaves the previous
            // document's candidate back-linked to the decision. The unique
            // decisionId constraint would then reject the new document's
            // back-link in Step 3 and abort the whole poll. Release the stale
            // link first; the old document returns to the unplaced queue.
            if (match.ada) {
                await tx.decisionCandidate.updateMany({
                    where: {
                        cityId: task.cityId,
                        ada: { not: match.ada },
                        decision: { subjectId: match.subjectId },
                    },
                    data: { decisionId: null },
                });
            }

            // The savepoint lets the fallback below run queries after a unique
            // violation — without it Postgres aborts the whole transaction and
            // every other match and candidate of this poll would roll back.
            await tx.$executeRaw`SAVEPOINT match_upsert`;
            try {
                await tx.decision.upsert({
                    where: { subjectId: match.subjectId },
                    create: {
                        subjectId: match.subjectId,
                        pdfUrl: match.pdfUrl,
                        protocolNumber: match.protocolNumber ?? null,
                        ada: match.ada ?? null,
                        title: match.decisionTitle ?? null,
                        publishDate: match.publishDate ? new Date(match.publishDate) : null,
                        taskId,
                    },
                    update: {
                        pdfUrl: match.pdfUrl,
                        protocolNumber: match.protocolNumber ?? null,
                        ada: match.ada ?? null,
                        title: match.decisionTitle ?? null,
                        publishDate: match.publishDate ? new Date(match.publishDate) : null,
                    },
                });
                await tx.$executeRaw`RELEASE SAVEPOINT match_upsert`;
            } catch (e) {
                // Concurrent poll race: another transaction committed a decision with the same
                // ADA between our conflict check and this upsert. Fall back to recording a claim.
                if (match.ada && (e as { code?: string })?.code === 'P2002') {
                    await tx.$executeRaw`ROLLBACK TO SAVEPOINT match_upsert`;
                    const outcome = await recordConflictClaim(tx, task.cityId, task.councilMeetingId, polledLocalDate, match);
                    conflictCount++;
                    console.log(`ADA conflict (concurrent, ${outcome}): ${match.ada} claimed by subject ${match.subjectId}`);
                    continue;
                }
                throw e;
            }

            processedCount++;

            // Track this ADA so later matches in the same batch see it as taken
            if (match.ada) {
                adaToExistingSubject.set(match.ada, match.subjectId);
            }
        }

        // Step 3: DecisionCandidate — persist every decision read in the window
        // (issue #617). Rows survive promotion; deleting the Decision reverts.
        if (result.decisions?.length) {
            // Prefetched for the orphan heal below.
            const storedRows = await tx.decisionCandidate.findMany({
                where: { cityId: task.cityId, ada: { in: result.decisions.map(d => d.ada) } },
                select: { ada: true, meetingDate: true, councilMeetingId: true, dismissedAt: true },
            });
            const storedByAda = new Map(storedRows.map(c => [c.ada, c]));
            // One city-wide meeting list resolves every declared date below.
            // localCalendarDate converts the UTC-stored instant to the city's
            // calendar date — the timezone conversion is load-bearing: without
            // it, midnight-stored meetings would shift a day.
            const cityMeetings = polledMeeting ? (await tx.councilMeeting.findMany({
                where: { cityId: task.cityId },
                select: { id: true, name: true, dateTime: true, administrativeBodyId: true },
                orderBy: { dateTime: 'asc' },
            })).map(m => ({
                id: m.id, name: m.name, administrativeBodyId: m.administrativeBodyId,
                localDate: localCalendarDate(m.dateTime, polledMeeting.city.timezone),
            })) : [];
            for (const d of result.decisions) {
                const stored = storedByAda.get(d.ada);
                const freshRead = !d.fromKnown && d.readStatus !== 'unread';
                // Resolve the declared session to one of our meetings (same body).
                let councilMeetingId: string | null = null;
                if (freshRead && d.meetingDate && polledMeeting?.administrativeBodyId) {
                    councilMeetingId = cityMeetings.find(m =>
                        m.administrativeBodyId === polledMeeting.administrativeBodyId
                        && m.localDate === d.meetingDate!.slice(0, 10))?.id ?? null;
                }
                // Orphan heal, for echoes only. knownDecisions is city-wide, so
                // this poll can carry another body's orphan — the polled body
                // cannot be trusted. Heal only when the declared date has
                // exactly one meeting in the whole city, which makes the body
                // question moot.
                let healedMeetingId: string | null = null;
                if (!freshRead && stored && !stored.councilMeetingId && !stored.dismissedAt && polledMeeting) {
                    const declared = d.meetingDate?.slice(0, 10)
                        ?? (stored.meetingDate ? stored.meetingDate.toISOString().slice(0, 10) : null);
                    if (declared) {
                        // Λογοδοσία sessions are excluded everywhere in the
                        // pipeline; they must neither receive a heal nor block
                        // an otherwise unambiguous one.
                        const sameDay = cityMeetings.filter(m =>
                            !isLogodosiaMeeting(m.name) && m.localDate === declared);
                        if (sameDay.length === 1) healedMeetingId = sameDay[0].id;
                    }
                }
                const promoted = await tx.decision.findUnique({
                    where: { ada: d.ada },
                    select: { id: true },
                });

                await tx.decisionCandidate.upsert({
                    where: { cityId_ada: { cityId: task.cityId, ada: d.ada } },
                    create: {
                        cityId: task.cityId,
                        ada: d.ada,
                        title: d.title,
                        pdfUrl: d.pdfUrl,
                        publishDate: d.publishDate ? new Date(d.publishDate) : null,
                        protocolNumber: d.protocolNumber,
                        meetingDate: d.meetingDate ? new Date(`${d.meetingDate}T00:00:00Z`) : null,
                        decisionNumber: d.decisionNumber,
                        readStatus: d.readStatus,
                        councilMeetingId,
                        subjectId: d.subjectId,
                        confidence: d.confidence,
                        reasoning: d.reasoning,
                        decisionId: promoted?.id ?? null,
                    },
                    update: {
                        // Reading fields refresh only when this poll actually read
                        // the document — a knownDecisions echo carries no new
                        // information and must not blank a stored reading.
                        ...(freshRead ? {
                            meetingDate: d.meetingDate ? new Date(`${d.meetingDate}T00:00:00Z`) : null,
                            decisionNumber: d.decisionNumber,
                            readStatus: d.readStatus,
                            councilMeetingId,
                        } : (healedMeetingId ? { councilMeetingId: healedMeetingId } : {})),
                        // The suggestion is recorded once, as made; later polls
                        // never overwrite an accepted suggestion's record.
                        ...(d.subjectId && !promoted ? { subjectId: d.subjectId, confidence: d.confidence, reasoning: d.reasoning } : {}),
                        ...(promoted ? { decisionId: promoted.id } : {}),
                    },
                });

                // Promotion copies the document's self-declared identity onto the Decision.
                if (promoted && (d.decisionNumber || d.meetingDate)) {
                    await tx.decision.update({
                        where: { id: promoted.id },
                        data: {
                            ...(d.decisionNumber ? { decisionNumber: d.decisionNumber } : {}),
                            ...(d.meetingDate ? { meetingDate: new Date(`${d.meetingDate}T00:00:00Z`) } : {}),
                        },
                    });
                }
            }
        }
    });

    // --- Process extraction results (excerpt, attendance, votes) ---
    // Each subject is wrapped in its own transaction for atomicity:
    // partial failures roll back individual subjects without blocking others.
    // Uses deleteMany + createMany instead of N individual upserts.
    let extractedCount = 0;
    if (result.extractions) {
        for (const decision of result.extractions.decisions) {
            try {
                await prisma.$transaction(async (tx) => {
                    // Skip extraction for subjects without a linked Decision — the backend
                    // match may have been wrong (ADA conflict), so this data is unreliable.
                    const existingDecision = await tx.decision.findFirst({
                        where: { subjectId: decision.subjectId },
                        select: { subjectId: true, title: true, protocolNumber: true, publishDate: true },
                    });
                    if (!existingDecision) {
                        console.log(`Skipping extraction for subject ${decision.subjectId} — no linked Decision`);
                        return;
                    }

                    // The extracted Αρ. Απόφασης goes to decisionNumber, never to
                    // protocolNumber: Diavgeia's protocol field is municipality-defined
                    // and stays a faithful mirror of what Diavgeia published. Older
                    // tasks versions sent this value under `protocolNumber`, but that
                    // slot could carry Diavgeia's protocol instead of the decision's
                    // own number, so it is not trusted here — during deploy skew the
                    // number stays null and the next poll's reading fills it.
                    const extractedDecisionNumber = decision.decisionNumber ?? null;

                    // 1. Update Decision excerpt, references, and backfill metadata if missing
                    await tx.decision.updateMany({
                        where: { subjectId: decision.subjectId },
                        data: {
                            excerpt: decision.excerpt || null,
                            references: decision.references || null,
                            ...(extractedDecisionNumber ? { decisionNumber: extractedDecisionNumber } : {}),
                            ...(!existingDecision.title && decision.diavgeiaTitle ? { title: decision.diavgeiaTitle } : {}),
                            ...(!existingDecision.protocolNumber && decision.diavgeiaProtocolNumber ? { protocolNumber: decision.diavgeiaProtocolNumber } : {}),
                            ...(!existingDecision.publishDate && decision.diavgeiaPublishDate ? { publishDate: new Date(decision.diavgeiaPublishDate) } : {}),
                        },
                    });

                    // 2. Create SubjectAttendance records (deduplicate by personId)
                    const attendanceByPerson = new Map<string, AttendanceStatus>(
                        [
                            ...decision.presentMemberIds.map(id => [id, 'PRESENT' as const] as const),
                            ...decision.absentMemberIds.map(id => [id, 'ABSENT' as const] as const),
                        ]
                    );

                    // Include mayor attendance if extracted from decision narrative
                    if (decision.mayorPresent != null && mayorId) {
                        attendanceByPerson.set(mayorId, decision.mayorPresent ? 'PRESENT' : 'ABSENT');
                    }

                    if (attendanceByPerson.size > 0) {
                        await tx.subjectAttendance.deleteMany({
                            where: { subjectId: decision.subjectId, source: DataSource.decision },
                        });
                        await tx.subjectAttendance.createMany({
                            data: [...attendanceByPerson].map(([personId, status]) => ({
                                subjectId: decision.subjectId,
                                personId,
                                status,
                                source: DataSource.decision,
                                taskId,
                            })),
                        });
                    }

                    // 3. Create SubjectVote records (deduplicate by personId)
                    // Vote inference (unanimous, majority) is handled by the backend —
                    // voteDetails already includes inferred FOR votes.
                    const voteByPerson = new Map<string, VoteType>();
                    for (const d of decision.voteDetails) {
                        voteByPerson.set(d.personId, d.vote);
                    }

                    if (voteByPerson.size > 0) {
                        await tx.subjectVote.deleteMany({
                            where: { subjectId: decision.subjectId, source: DataSource.decision },
                        });
                        await tx.subjectVote.createMany({
                            data: [...voteByPerson].map(([personId, voteType]) => ({
                                subjectId: decision.subjectId,
                                personId,
                                voteType,
                                source: DataSource.decision,
                                taskId,
                            })),
                        });
                    }

                    // TODO: Re-enable once the codebase stops using `agendaItemIndex !== null`
                    // as a proxy for "is a regular agenda item". Currently, most display
                    // and categorization logic (categorizeSubjects, sidebar, the meeting decisions page,
                    // subject-card, MinutesPreviewContent, subject-helpers upsert matching,
                    // etc.) assumes outOfAgenda subjects have agendaItemIndex === null.
                    // Setting it here causes them to be miscategorized as regular agenda
                    // items across the UI. To enable this, those checks need to use
                    // nonAgendaReason as the primary discriminator instead.
                    //
                    // 4. Update agendaItemIndex from subjectInfo for outOfAgenda subjects
                    // if (decision.subjectInfo?.number != null) {
                    //     await tx.subject.updateMany({
                    //         where: {
                    //             id: decision.subjectId,
                    //             agendaItemIndex: null,
                    //             nonAgendaReason: 'outOfAgenda',
                    //         },
                    //         data: { agendaItemIndex: decision.subjectInfo.number },
                    //     });
                    // }
                });

                extractedCount++;
            } catch (error) {
                console.error(`Failed to write extraction data for subject ${decision.subjectId}:`, error);
            }

            // Log unmatched members (outside transaction — informational only)
            if (decision.unmatchedMembers.length > 0) {
                for (const name of decision.unmatchedMembers) {
                    console.log(`  Unmatched member "${name}" in subject "${decision.subjectId}"`);
                }
            }

            // Log per-decision warnings from validation
            if (decision.warnings && decision.warnings.length > 0) {
                for (const w of decision.warnings) {
                    console.log(`  [${w.severity}] ${w.code}: ${w.message} (subject ${decision.subjectId})`);
                }
            }
        }

        // --- Store meeting-level initial attendance (roll call) ---
        if (result.extractions.initialAttendance && result.extractions.initialAttendance.length > 0) {
            try {
                const cityId = task.cityId!;
                const meetingId = task.councilMeetingId!;
                await prisma.$transaction(async (tx) => {
                    await tx.meetingAttendance.deleteMany({
                        where: { cityId, councilMeetingId: meetingId, source: DataSource.decision },
                    });
                    await tx.meetingAttendance.createMany({
                        data: result.extractions!.initialAttendance!.map(a => ({
                            cityId,
                            councilMeetingId: meetingId,
                            personId: a.personId,
                            status: a.status,
                            source: DataSource.decision,
                            taskId,
                        })),
                    });
                });
                console.log(`Stored ${result.extractions.initialAttendance.length} meeting-level attendance records`);
            } catch (error) {
                console.error('Failed to store meeting-level attendance:', error);
            }
        }

        // --- Store SubjectAttendance for subjects without decisions ---
        // These subjects have no PDF but their effective attendance was computed
        // using the complete discussion order and aggregated attendance changes.
        if (result.extractions.nonDecisionSubjectAttendance && result.extractions.nonDecisionSubjectAttendance.length > 0) {
            let storedCount = 0;
            for (const subjectAttendance of result.extractions.nonDecisionSubjectAttendance) {
                if (!validSubjectIdSet.has(subjectAttendance.subjectId)) {
                    console.warn(`Poll decisions: skipping invalid subjectId ${subjectAttendance.subjectId} in nonDecisionSubjectAttendance for task ${taskId}`);
                    continue;
                }
                if (subjectAttendance.presentMemberIds.length === 0 && subjectAttendance.absentMemberIds.length === 0) continue;

                try {
                    await prisma.$transaction(async (tx) => {
                        const attendanceByPerson = new Map<string, AttendanceStatus>(
                            [
                                ...subjectAttendance.presentMemberIds.map(id => [id, 'PRESENT' as const] as const),
                                ...subjectAttendance.absentMemberIds.map(id => [id, 'ABSENT' as const] as const),
                            ]
                        );

                        // Include mayor attendance if known
                        if (mayorId && result.extractions!.initialAttendance) {
                            const mayorInitial = result.extractions!.initialAttendance.find(a => a.personId === mayorId);
                            if (mayorInitial && !attendanceByPerson.has(mayorId)) {
                                attendanceByPerson.set(mayorId, mayorInitial.status);
                            }
                        }

                        await tx.subjectAttendance.deleteMany({
                            where: { subjectId: subjectAttendance.subjectId, source: DataSource.decision },
                        });
                        await tx.subjectAttendance.createMany({
                            data: [...attendanceByPerson].map(([personId, status]) => ({
                                subjectId: subjectAttendance.subjectId,
                                personId,
                                status,
                                source: DataSource.decision,
                                taskId,
                            })),
                        });
                    });
                    storedCount++;
                } catch (error) {
                    console.error(`Failed to store attendance for subject ${subjectAttendance.subjectId}:`, error);
                }
            }
            if (storedCount > 0) {
                console.log(`Stored effective attendance for ${storedCount} non-decision subjects`);
            }
        }

        if (result.extractions.warnings.length > 0) {
            console.log(`Extraction warnings (${result.extractions.warnings.length}):`);
            for (const w of result.extractions.warnings) {
                console.log(`  - ${w}`);
            }
        }
    }

    // Enrich responseBody with post-processing counts so the batch completion
    // hook (checkBatchCompletionAndAlert) can read accurate totals from DB.
    // Wrapped in try/catch because this runs after the main transaction committed —
    // a failure here should not mark the task as failed when decisions were already persisted.
    try {
        // Same query the decisions page uses, so the alert and the UI agree on
        // what needs triage after this run.
        const unresolved = await getUnresolvedCandidatesForMeeting(task.cityId, task.councilMeetingId);
        const reads = result.decisions ?? [];
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: {
                responseBody: JSON.stringify({
                    ...result,
                    _processedCounts: {
                        matches: processedCount,
                        reassignments: reassignmentCount,
                        conflicts: conflictCount,
                        extractions: extractedCount,
                        unplaced: unresolved.length,
                        suggested: unresolved.filter(c => c.subjectId !== null).length,
                        unmatchedSubjects: result.unmatchedSubjects.length,
                        readIssues: reads.filter(d => d.readStatus === 'unreadable' || d.readStatus === 'no_meeting_date').length,
                    },
                }),
            },
        });
    } catch (enrichError) {
        console.error(`Failed to enrich responseBody for task ${taskId} (decisions already persisted):`, enrichError);
    }

    console.log(`Poll decisions completed: ${processedCount} matched, ${extractedCount} extracted, ${reassignmentCount} reassigned, ${conflictCount} conflicts, ${result.unmatchedSubjects.length} unmatched, ${result.ambiguousSubjects.length} ambiguous`);
}
