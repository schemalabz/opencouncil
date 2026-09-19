// Server-only (NOT a "use server" action). getTaskStatusDirect skips the user
// gate on purpose — its sole caller, the taskStatuses callback route, is hit by
// the task server with no session: the callback is authenticated by its HMAC
// token (POST/PUT) or by isUserAuthorizedToEdit (GET/DELETE) at the route, so a
// user-session gate cannot live inside the function. Keeping it off the Server
// Action surface is what prevents a client from invoking it directly to probe
// task ids.
import "server-only";
import type { TaskStatus } from '@prisma/client';
import prisma from "./prisma";

/**
 * Read a task status by id, scoped to a (cityId, councilMeetingId) tenant.
 *
 * The lookup also matches on cityId/councilMeetingId, so a task that exists but
 * belongs to another tenant resolves to `null` — the callback route maps that to a
 * 404, with no cross-tenant existence leak. The scope is required: the route is the
 * only caller and always knows its path tenant, so there is no unscoped escape hatch.
 */
export async function getTaskStatusDirect(
    taskStatusId: string,
    scope: { cityId: string; councilMeetingId: string }
): Promise<TaskStatus | null> {
    return prisma.taskStatus.findFirst({
        where: {
            id: taskStatusId,
            cityId: scope.cityId,
            councilMeetingId: scope.councilMeetingId,
        },
    });
}
