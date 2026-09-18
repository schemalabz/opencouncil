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
