import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import type { MeetingTaskType } from './types';

/**
 * Steps that must not run at the same time on one meeting. A transcribe
 * replaces the segments when its result arrives; a fixTranscript or a
 * summarize that ran meanwhile worked on rows that are gone by then, and the
 * money it cost is lost with them. The two correction steps edit the same
 * text, so neither runs beside the other. The rule holds in both directions
 * and `force` does not lift it.
 */
const EXCLUSIVE_WITH: Partial<Record<MeetingTaskType, readonly MeetingTaskType[]>> = {
    transcribe: ['fixTranscript', 'fixFromMinutes', 'summarize'],
    fixTranscript: ['transcribe', 'fixFromMinutes'],
    fixFromMinutes: ['transcribe', 'fixTranscript'],
    summarize: ['transcribe'],
};

/**
 * A task of the meeting that is still running and excludes `taskType`, or null.
 *
 * A task whose result has arrived (responseBody set) no longer counts: the
 * task server is done with it, its handler is writing the rows, and that
 * handler is what starts the next step (transcribe → fixTranscript) before
 * the status reads succeeded.
 */
export async function findConflictingTask(
    taskType: MeetingTaskType,
    cityId: string,
    councilMeetingId: string,
    db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<{ id: string; type: string } | null> {
    const blockers = EXCLUSIVE_WITH[taskType];
    if (!blockers) return null;
    return db.taskStatus.findFirst({
        where: {
            cityId,
            councilMeetingId,
            type: { in: [...blockers] },
            status: { notIn: ['succeeded', 'failed'] },
            responseBody: null,
        },
        select: { id: true, type: true },
    });
}
