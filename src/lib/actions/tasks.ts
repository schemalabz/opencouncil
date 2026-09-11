"use server";

import { processTaskResponse as processResponse } from "@/lib/tasks/tasks";

/**
 * Browser-facing task reprocess for the admin task list.
 *
 * The orchestration module is server-only. processTaskResponse gates on
 * withUserAuthorizedToEdit for the task's city before it runs a handler.
 */
export async function processTaskResponse(
    taskType: string,
    taskId: string,
    options?: { force?: boolean },
): Promise<void> {
    return processResponse(taskType, taskId, options);
}
