// Server-only (NOT a "use server" action). getTaskStatusDirect and
// deleteTaskStatusDirect skip the user gate on purpose. Their only caller is the
// taskStatuses route, which settles access itself: POST/PUT come from the task
// server with no session and carry an HMAC token, DELETE checks
// isUserAuthorizedToEdit before it deletes, and GET is public but redacts task
// bodies for non-editors. Keeping them off the Server Action surface is what
// prevents a client from invoking them directly to probe or delete task ids.
import "server-only";
import type { Prisma, TaskStatus } from '@prisma/client';
import prisma from "./prisma";
import { TASK_CONFIG } from '@/lib/tasks/types';

/** The meeting a task belongs to, as named by the callback route's path. */
export type TaskStatusScope = Pick<TaskStatus, 'cityId' | 'councilMeetingId'>;

/**
 * A task in another city or meeting matches nothing, so the route answers 404 and
 * does not reveal that the task exists. The fields are copied, not spread, so a
 * wider object cannot add filters to the query.
 */
function scopedTaskStatus(taskStatusId: string, scope: TaskStatusScope): Prisma.TaskStatusWhereInput {
    return { id: taskStatusId, cityId: scope.cityId, councilMeetingId: scope.councilMeetingId };
}

export async function getTaskStatusDirect(taskStatusId: string, scope: TaskStatusScope): Promise<TaskStatus | null> {
    return prisma.taskStatus.findFirst({ where: scopedTaskStatus(taskStatusId, scope) });
}

/**
 * Delete a task inside its tenant, unless it was updated after `notUpdatedAfter`.
 * Returns the number of rows removed: 0 means a concurrent delete removed the task,
 * or a callback updated it after the caller's own check.
 */
export async function deleteTaskStatusDirect(
    taskStatusId: string,
    scope: TaskStatusScope,
    notUpdatedAfter: Date
): Promise<number> {
    const { count } = await prisma.taskStatus.deleteMany({
        where: { ...scopedTaskStatus(taskStatusId, scope), updatedAt: { lte: notUpdatedAfter } },
    });
    return count;
}

/**
 * Failure reasons of a meeting's most recent failed transcribes, newest first.
 *
 * Selects `failureReason` only. `responseBody` holds the whole result of a
 * transcribe, and `requestBody` holds up to 50 voiceprint embeddings. Reading
 * either would make this expensive.
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
        select: { failureReason: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    return rows.map(row => row.failureReason ?? '');
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
    /** The failure reason of a failed task; null otherwise. */
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
 * The tasks of a meeting, newest first, capped per type, with the failure
 * reason of the failed ones. The bodies stay out of the first read for the
 * reason given above; the failed rows are read again for `failureReason` alone.
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
            select: { id: true, failureReason: true },
        });
    const errorById = new Map(errors.map(row => [row.id, row.failureReason]));

    return rows.map(row => ({ ...row, error: errorById.get(row.id) ?? null }));
}
