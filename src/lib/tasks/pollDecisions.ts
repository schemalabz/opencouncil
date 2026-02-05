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
