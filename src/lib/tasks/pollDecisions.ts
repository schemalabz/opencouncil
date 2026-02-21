"use server";

import { PollDecisionsRequest, PollDecisionsResult } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { upsertDecision, getDecisionForSubject } from "../db/decisions";
export { getDecisionForSubject };
import { withUserAuthorizedToEdit } from "../auth";
import { shouldSkipPolling, BACKOFF_SCHEDULE, MAX_POLLING_DAYS } from "./pollDecisionsBackoff";

export async function requestPollDecisions(
    cityId: string,
    councilMeetingId: string,
    subjectIds?: string[]
) {
    await withUserAuthorizedToEdit({ cityId });

    return pollDecisionsForMeeting(cityId, councilMeetingId, subjectIds);
}

/**
 * Core function to poll decisions for a meeting. Used by both the admin action and the cron job.
 * Does NOT check authorization — callers are responsible for auth.
 */
export async function pollDecisionsForMeeting(
    cityId: string,
    councilMeetingId: string,
    subjectIds?: string[]
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
                },
            },
            administrativeBody: {
                select: {
                    diavgeiaUnitIds: true,
                },
            },
            subjects: {
                select: {
                    id: true,
                    name: true,
                    agendaItemIndex: true,
                },
                where: {
                    agendaItemIndex: { not: null },
                    ...(subjectIds && {
                        id: { in: subjectIds },
                    }),
                },
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
        throw new Error("No eligible subjects to poll (subjects must have agendaItemIndex)");
    }

    const body: Omit<PollDecisionsRequest, 'callbackUrl'> = {
        meetingDate: councilMeeting.dateTime.toISOString().split('T')[0],
        diavgeiaUid: councilMeeting.city.diavgeiaUid,
        diavgeiaUnitIds: councilMeeting.administrativeBody?.diavgeiaUnitIds.length
            ? councilMeeting.administrativeBody.diavgeiaUnitIds
            : undefined,
        subjects: councilMeeting.subjects.map(s => ({
            subjectId: s.id,
            name: s.name,
        })),
    };

    return startTask('pollDecisions', body, councilMeetingId, cityId);
}

/**
 * Polls decisions for recent meetings across all cities with Diavgeia configured.
 * Called by the cron endpoint. Finds meetings from the last 90 days that still have
 * subjects without linked decisions, and dispatches pollDecisions tasks for them.
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
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Find meetings from the last 90 days in cities with diavgeiaUid,
    // that have at least one subject with agendaItemIndex but no decision
    const meetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: { gte: ninetyDaysAgo },
            city: {
                diavgeiaUid: { not: null },
            },
            subjects: {
                some: {
                    agendaItemIndex: { not: null },
                    decision: null,
                },
            },
        },
        select: {
            id: true,
            cityId: true,
        },
        orderBy: { dateTime: 'desc' },
        take: 50, // Fetch extra candidates since many may be skipped by backoff
    });

    if (meetings.length === 0) {
        return { meetingsProcessed: 0, results: [] };
    }

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

    for (const meeting of meetings) {
        if (dispatched >= 10) break;

        const key = `${meeting.cityId}:${meeting.id}`;
        const history = historyByMeeting.get(key);

        const skipReason = shouldSkipPolling(
            history?.firstPollAt ?? null,
            history?.lastPollAt ?? null,
        );
        if (skipReason) {
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `skipped: ${skipReason}` });
            continue;
        }

        try {
            // Only poll for subjects that don't have a decision yet
            const unlinkedSubjects = await prisma.subject.findMany({
                where: {
                    councilMeetingId: meeting.id,
                    cityId: meeting.cityId,
                    agendaItemIndex: { not: null },
                    decision: null,
                },
                select: { id: true },
            });

            if (unlinkedSubjects.length === 0) continue;

            await pollDecisionsForMeeting(
                meeting.cityId,
                meeting.id,
                unlinkedSubjects.map(s => s.id)
            );

            dispatched++;
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: 'started' });
        } catch (error) {
            console.error(`Failed to poll decisions for meeting ${meeting.cityId}/${meeting.id}:`, error);
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `error: ${(error as Error).message}` });
        }
    }

    return { meetingsProcessed: dispatched, results };
}

/**
 * Returns statistics about decision polling effectiveness.
 * For each decision discovered by polling: when was it published on Diavgeia,
 * when did we find it, and how many poll attempts it took.
 * Use this to fine-tune the BACKOFF_SCHEDULE.
 */
export async function getPollingStats() {
    // Decisions discovered by polling (have a taskId)
    const discoveries = await prisma.decision.findMany({
        where: { taskId: { not: null } },
        select: {
            subjectId: true,
            ada: true,
            issueDate: true,
            createdAt: true,
            task: {
                select: {
                    id: true,
                    createdAt: true,
                    councilMeetingId: true,
                    cityId: true,
                },
            },
            subject: {
                select: {
                    name: true,
                    councilMeeting: {
                        select: { dateTime: true },
                    },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // For each discovery, count how many poll attempts happened for that meeting
    // before (and including) the discovery task
    const meetingIds = [...new Set(discoveries.map(d => d.task!.councilMeetingId))];

    const pollCounts = meetingIds.length > 0
        ? await prisma.taskStatus.groupBy({
            by: ['councilMeetingId', 'cityId'],
            where: {
                councilMeetingId: { in: meetingIds },
                type: 'pollDecisions',
                status: 'succeeded',
            },
            _count: true,
            _min: { createdAt: true },
        })
        : [];

    const pollCountByMeeting = new Map(
        pollCounts.map(p => [
            `${p.cityId}:${p.councilMeetingId}`,
            { totalPolls: p._count, firstPollAt: p._min.createdAt },
        ])
    );

    const discoveryDetails = discoveries.map(d => {
        const task = d.task!;
        const key = `${task.cityId}:${task.councilMeetingId}`;
        const meetingPolls = pollCountByMeeting.get(key);

        const meetingDate = d.subject.councilMeeting.dateTime;
        const discoveredAt = task.createdAt;
        const firstPollAt = meetingPolls?.firstPollAt ?? discoveredAt;
        const issueDate = d.issueDate;

        // How long after Diavgeia published did we find it?
        const discoveryDelayDays = issueDate
            ? (discoveredAt.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)
            : null;

        // How long after we started polling did we find it?
        const pollingDurationDays = (discoveredAt.getTime() - firstPollAt.getTime()) / (1000 * 60 * 60 * 24);

        // How long after the meeting did Diavgeia publish?
        const publishDelayDays = issueDate
            ? (issueDate.getTime() - meetingDate.getTime()) / (1000 * 60 * 60 * 24)
            : null;

        return {
            cityId: task.cityId,
            meetingId: task.councilMeetingId,
            meetingDate: meetingDate.toISOString().split('T')[0],
            subjectId: d.subjectId,
            subjectName: d.subject.name,
            ada: d.ada,
            issueDate: issueDate?.toISOString().split('T')[0] ?? null,
            discoveredAt: discoveredAt.toISOString(),
            firstPollAt: firstPollAt.toISOString(),
            totalPollsForMeeting: meetingPolls?.totalPolls ?? 1,
            discoveryDelayDays: discoveryDelayDays !== null ? Math.round(discoveryDelayDays * 10) / 10 : null,
            pollingDurationDays: Math.round(pollingDurationDays * 10) / 10,
            publishDelayDays: publishDelayDays !== null ? Math.round(publishDelayDays * 10) / 10 : null,
        };
    });

    // Compute summary stats
    const delaysWithData = discoveryDetails.filter(d => d.discoveryDelayDays !== null);
    const sortedDelays = delaysWithData.map(d => d.discoveryDelayDays!).sort((a, b) => a - b);
    const publishDelaysWithData = discoveryDetails.filter(d => d.publishDelayDays !== null);
    const sortedPublishDelays = publishDelaysWithData.map(d => d.publishDelayDays!).sort((a, b) => a - b);

    const median = (arr: number[]) => {
        if (arr.length === 0) return null;
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    const avg = (arr: number[]) => arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;

    // Meetings still being actively polled (have unlinked subjects)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const stillPolling = await prisma.councilMeeting.count({
        where: {
            dateTime: { gte: ninetyDaysAgo },
            city: { diavgeiaUid: { not: null } },
            subjects: {
                some: {
                    agendaItemIndex: { not: null },
                    decision: null,
                },
            },
        },
    });

    // Recent poll tasks for the "Recent Polls" table
    const recentPollTasks = await prisma.taskStatus.findMany({
        where: { type: 'pollDecisions' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
            id: true,
            createdAt: true,
            status: true,
            councilMeetingId: true,
            cityId: true,
            requestBody: true,
            responseBody: true,
        },
    });

    const recentPolls = recentPollTasks.map(task => {
        let subjectsPolled = 0;
        let matchesFound: number | null = null;
        let unmatchedCount: number | null = null;
        let ambiguousCount: number | null = null;

        try {
            const req = JSON.parse(task.requestBody) as { subjects?: unknown[] };
            subjectsPolled = Array.isArray(req.subjects) ? req.subjects.length : 0;
        } catch { /* ignore parse errors */ }

        if (task.status === 'succeeded' && task.responseBody) {
            try {
                const res = JSON.parse(task.responseBody) as {
                    matches?: unknown[];
                    unmatchedSubjects?: unknown[];
                    ambiguousSubjects?: unknown[];
                };
                matchesFound = Array.isArray(res.matches) ? res.matches.length : 0;
                unmatchedCount = Array.isArray(res.unmatchedSubjects) ? res.unmatchedSubjects.length : 0;
                ambiguousCount = Array.isArray(res.ambiguousSubjects) ? res.ambiguousSubjects.length : 0;
            } catch { /* ignore parse errors */ }
        }

        return {
            id: task.id,
            createdAt: task.createdAt.toISOString(),
            status: task.status,
            councilMeetingId: task.councilMeetingId,
            cityId: task.cityId,
            subjectsPolled,
            matchesFound,
            unmatchedCount,
            ambiguousCount,
        };
    });

    return {
        backoffSchedule: BACKOFF_SCHEDULE,
        maxPollingDays: MAX_POLLING_DAYS,
        summary: {
            totalDiscoveries: discoveryDetails.length,
            meetingsStillPolling: stillPolling,
            discoveryDelay: {
                avgDays: avg(sortedDelays),
                medianDays: median(sortedDelays),
                minDays: sortedDelays.length > 0 ? sortedDelays[0] : null,
                maxDays: sortedDelays.length > 0 ? sortedDelays[sortedDelays.length - 1] : null,
            },
            publishDelay: {
                description: "Days between meeting date and Diavgeia publication",
                avgDays: avg(sortedPublishDelays),
                medianDays: median(sortedPublishDelays),
                minDays: sortedPublishDelays.length > 0 ? sortedPublishDelays[0] : null,
                maxDays: sortedPublishDelays.length > 0 ? sortedPublishDelays[sortedPublishDelays.length - 1] : null,
            },
        },
        discoveries: discoveryDetails,
        recentPolls,
    };
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
            status: { in: ['pending'] },
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

    // Poll for all unlinked subjects in the meeting, not just the one requested.
    // This keeps the per-meeting "last searched" timestamp accurate for every subject.
    const unlinkedSubjects = await prisma.subject.findMany({
        where: {
            councilMeetingId: subject.councilMeetingId,
            cityId: subject.cityId,
            agendaItemIndex: { not: null },
            decision: null,
        },
        select: { id: true },
    });

    const task = await pollDecisionsForMeeting(
        subject.cityId,
        subject.councilMeetingId,
        unlinkedSubjects.map(s => s.id)
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
 * Used by the DecisionsPanel to show polling status.
 */
export async function getPollingHistoryForMeeting(
    cityId: string,
    councilMeetingId: string
): Promise<{
    totalPolls: number;
    firstPollAt: string | null;
    lastPollAt: string | null;
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
            currentTierLabel: null,
            nextPollEligible: null,
        };
    }

    const now = Date.now();
    const daysSinceFirstPoll = (now - firstPollAt.getTime()) / (1000 * 60 * 60 * 24);

    // Check if polling has exceeded the max window
    if (daysSinceFirstPoll >= MAX_POLLING_DAYS) {
        return {
            totalPolls,
            firstPollAt: firstPollAt.toISOString(),
            lastPollAt: lastPollAt.toISOString(),
            currentTierLabel: `Stopped (exceeded ${MAX_POLLING_DAYS}-day window)`,
            nextPollEligible: null,
        };
    }

    // Find the current tier
    const tier = [...BACKOFF_SCHEDULE].reverse().find(t => daysSinceFirstPoll >= t.afterDays);

    let currentTierLabel: string;
    if (!tier || tier.minIntervalDays === 0) {
        currentTierLabel = 'Every cron run';
    } else {
        const weekNum = Math.floor(tier.afterDays / 7) + 1;
        currentTierLabel = `Week ${weekNum}: polling every ${tier.minIntervalDays} days`;
    }

    // Calculate when next poll is eligible
    let nextPollEligible: string | null = null;
    if (tier && tier.minIntervalDays > 0) {
        const nextEligible = new Date(lastPollAt.getTime() + tier.minIntervalDays * 24 * 60 * 60 * 1000);
        if (nextEligible.getTime() > now) {
            nextPollEligible = nextEligible.toISOString();
        }
        // If nextEligible is in the past, the next cron run will poll
    }

    return {
        totalPolls,
        firstPollAt: firstPollAt.toISOString(),
        lastPollAt: lastPollAt.toISOString(),
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

export async function handlePollDecisionsResult(taskId: string, result: PollDecisionsResult) {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    // Validate that all returned subjectIds belong to this task's meeting
    const validSubjectIds = await prisma.subject.findMany({
        where: {
            id: { in: result.matches.map(m => m.subjectId) },
            cityId: task.cityId,
            councilMeetingId: task.councilMeetingId,
        },
        select: { id: true },
    });
    const validSubjectIdSet = new Set(validSubjectIds.map(s => s.id));

    let processedCount = 0;
    for (const match of result.matches) {
        // Skip any subjectIds that don't belong to this meeting
        if (!validSubjectIdSet.has(match.subjectId)) {
            console.warn(`Poll decisions: skipping invalid subjectId ${match.subjectId} for task ${taskId}`);
            continue;
        }

        await upsertDecision({
            subjectId: match.subjectId,
            pdfUrl: match.pdfUrl,
            ada: match.ada,
            protocolNumber: match.protocolNumber,
            title: match.decisionTitle,
            issueDate: new Date(match.issueDate),
            taskId, // Track that this decision was created by this task
        });
        processedCount++;
    }

    console.log(`Poll decisions completed: ${processedCount} processed, ${result.unmatchedSubjects.length} unmatched, ${result.ambiguousSubjects.length} ambiguous`);
}
