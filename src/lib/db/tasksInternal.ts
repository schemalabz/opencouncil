// Server-only (NOT a "use server" action). getTaskStatusDirect skips the user
// gate on purpose — its sole caller, the taskStatuses callback route, is hit by
// the task server with no session: possession of the unguessable taskStatusId
// is the authorization, so a user-session gate cannot live inside the function.
// Keeping it off the Server Action surface is what prevents a client from
// invoking it directly to probe task ids.
import "server-only";
import type { Prisma, TaskStatus } from '@prisma/client';
import prisma from "./prisma";
import { TASK_CONFIG } from "../tasks/types";

export async function getTaskStatusDirect(taskStatusId: string): Promise<TaskStatus | null> {
    return prisma.taskStatus.findUnique({
        where: { id: taskStatusId },
    });
}

/**
 * Error bodies of a meeting's most recent failed transcribes, newest first.
 *
 * Selects `responseBody` only for FAILED rows: on a failure it holds just the error
 * string, but on a succeeded transcribe it holds the whole result, and `requestBody`
 * holds up to 50 voiceprint embeddings. Widening either would make this expensive.
 *
 * No user gate, for the same reason as getTaskStatusDirect: the caller is the
 * poll-livestreams cron, which runs with no session.
 */
export async function getRecentTranscribeFailureErrors(
    cityId: string,
    councilMeetingId: string,
    limit: number,
): Promise<string[]> {
    const rows = await prisma.taskStatus.findMany({
        where: { cityId, councilMeetingId, type: 'transcribe', status: 'failed' },
        select: { responseBody: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    return rows.map(row => row.responseBody ?? '');
}

const meetingTaskSelect = {
    id: true,
    type: true,
    status: true,
    stage: true,
    percentComplete: true,
    createdAt: true,
    updatedAt: true,
    version: true,
} satisfies Prisma.TaskStatusSelect;

export type MeetingTaskRow = Prisma.TaskStatusGetPayload<{ select: typeof meetingTaskSelect }> & {
    /** The answer of the task server, for a failed task only. */
    error: string | null;
};

/**
 * The newest rows of each task type. A meeting that was reprocessed many
 * times, or polled for decisions on a schedule, holds far more rows than a
 * reader of its status needs.
 */
export const MEETING_TASKS_PER_TYPE = 5;

const MEETING_TASK_TYPES = Object.keys(TASK_CONFIG);

/**
 * The tasks of a meeting, newest first, capped per type, with the error text
 * of the failed ones. The bodies stay out of the first read for the reason
 * given above; the failed rows are read again for their error string alone.
 *
 * No user gate: the MCP server authorizes with a token before it calls this.
 */
export async function getTasksForMeetingDirect(cityId: string, councilMeetingId: string): Promise<MeetingTaskRow[]> {
    // One bounded, indexed read per type instead of the whole history: a
    // meeting polled for decisions on a schedule holds hundreds of rows.
    const perType = await Promise.all(
        MEETING_TASK_TYPES.map(type => prisma.taskStatus.findMany({
            where: { cityId, councilMeetingId, type },
            select: meetingTaskSelect,
            orderBy: { createdAt: 'desc' },
            take: MEETING_TASKS_PER_TYPE,
        }))
    );
    const rows = perType.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const failedIds = rows.filter(row => row.status === 'failed').map(row => row.id);
    const errors = failedIds.length === 0
        ? []
        : await prisma.taskStatus.findMany({
            where: { id: { in: failedIds } },
            select: { id: true, responseBody: true },
        });
    const errorById = new Map(errors.map(row => [row.id, row.responseBody]));

    return rows.map(row => ({ ...row, error: errorById.get(row.id) ?? null }));
}
