import prisma from '@/lib/db/prisma';
import type { MeetingTaskType } from './types';

/**
 * Steps that must not run at the same time on one meeting. A transcribe
 * replaces the segments when its result arrives; a fixTranscript or a
 * summarize that ran meanwhile worked on rows that are gone by then, and the
 * money it cost is lost with them. The rule holds in both directions and
 * `force` does not lift it.
 */
const EXCLUSIVE_WITH: Partial<Record<MeetingTaskType, readonly MeetingTaskType[]>> = {
    transcribe: ['fixTranscript', 'summarize'],
    fixTranscript: ['transcribe'],
    summarize: ['transcribe'],
};

/** A task of the meeting that is not in a terminal state and excludes `taskType`, or null. */
export async function findConflictingTask(
    taskType: MeetingTaskType,
    cityId: string,
    councilMeetingId: string
): Promise<{ id: string; type: string } | null> {
    const blockers = EXCLUSIVE_WITH[taskType];
    if (!blockers) return null;
    return prisma.taskStatus.findFirst({
        where: { cityId, councilMeetingId, type: { in: [...blockers] }, status: { notIn: ['succeeded', 'failed'] } },
        select: { id: true, type: true },
    });
}
