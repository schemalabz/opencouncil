// Server-only (NOT a "use server" action). getTaskStatusDirect skips the user
// gate on purpose — its sole caller, the taskStatuses callback route, is hit by
// the task server with no session: possession of the unguessable taskStatusId
// is the authorization, so a user-session gate cannot live inside the function.
// Keeping it off the Server Action surface is what prevents a client from
// invoking it directly to probe task ids.
import "server-only";
import type { TaskStatus } from '@prisma/client';
import prisma from "./prisma";

export async function getTaskStatusDirect(taskStatusId: string): Promise<TaskStatus | null> {
    return prisma.taskStatus.findUnique({
        where: { id: taskStatusId },
    });
}
