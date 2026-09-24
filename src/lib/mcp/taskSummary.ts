import type { MeetingTaskRow } from '@/lib/db/tasksInternal';

/**
 * A task row as the tools report it. Terminal tasks carry `finishedAt`; a
 * failed one carries the answer of the task server, cut so a stack trace
 * cannot fill the payload.
 */
export function mcpTaskSummary(task: MeetingTaskRow) {
    const finished = task.status === 'succeeded' || task.status === 'failed';
    return {
        id: task.id,
        type: task.type,
        status: task.status,
        ...(task.stage && { stage: task.stage }),
        ...(task.percentComplete !== null && !finished && { percentComplete: task.percentComplete }),
        startedAt: task.createdAt.toISOString(),
        ...(finished && { finishedAt: task.updatedAt.toISOString() }),
        ...(task.status === 'failed' && { error: task.error?.slice(0, 500) ?? 'unknown error' }),
    };
}
