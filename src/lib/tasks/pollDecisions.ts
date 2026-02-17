"use server";

import { PollDecisionsRequest, PollDecisionsResult } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { upsertDecision, getDecisionForSubject } from "../db/decisions";
export { getDecisionForSubject };
import { withUserAuthorizedToEdit } from "../auth";

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
 * Limits to 10 meetings per invocation.
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
        take: 10,
    });

    const results: Array<{ cityId: string; meetingId: string; status: string }> = [];

    for (const meeting of meetings) {
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

            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: 'started' });
        } catch (error) {
            console.error(`Failed to poll decisions for meeting ${meeting.cityId}/${meeting.id}:`, error);
            results.push({ cityId: meeting.cityId, meetingId: meeting.id, status: `error: ${(error as Error).message}` });
        }
    }

    return { meetingsProcessed: results.length, results };
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
