import type { MeetingTaskRow } from '@/lib/db/tasksInternal';
import { parseMediaFailure, sanitizeMediaErrorText } from '@/lib/tasks/mediaMetadata';

/**
 * A task row as the tools report it. Terminal tasks carry `finishedAt`; a
 * failed one carries its failure reason, cut so a stack trace cannot fill
 * the payload.
 */
export function mcpTaskSummary(task: MeetingTaskRow) {
    const finished = task.status === 'succeeded' || task.status === 'failed';
    const mediaFailure = task.type === 'transcribe' && task.status === 'failed' ? parseMediaFailure(task.mediaFailure) : undefined;
    const error = task.type === 'transcribe' && task.error ? sanitizeMediaErrorText(task.error) : task.error;
    return {
        ...(mediaFailure && { mediaFailure }),
        id: task.id,
        type: task.type,
        status: task.status,
        ...(task.stage && { stage: task.stage }),
        ...(task.percentComplete !== null && !finished && { percentComplete: task.percentComplete }),
        startedAt: task.createdAt.toISOString(),
        ...(finished && { finishedAt: task.updatedAt.toISOString() }),
        ...(task.status === 'failed' && { error: error?.slice(0, 500) ?? 'unknown error' }),
    };
}
