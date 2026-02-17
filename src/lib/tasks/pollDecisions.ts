"use server";

import { PollDecisionsRequest, PollDecisionsResult } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { upsertDecision } from "../db/decisions";
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
