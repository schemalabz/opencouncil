/**
 * Core fixTranscript logic without auth checks: the request, and the handler of
 * the task server's result.
 *
 * NOT in a "use server" file — this must not be callable as a Server Action.
 * Only called from:
 *   - requestFixTranscript (after withUserAuthorizedToEdit), in ./fixTranscript
 *   - the transcribe result handler's auto-trigger, which runs on a task-server
 *     callback with no user session to authorize against
 */
import "server-only";
import prisma from '@/lib/db/prisma';
import { FixTranscriptResult } from '@/lib/apiTypes';
import { getFixTranscriptRequestBody } from '@/lib/db/utils';
import { startTask } from '@/lib/tasks/tasks';
import { applySpeakerHints } from './speakerHints';

export const requestFixTranscriptInternal = async (councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    const requestBody = await getFixTranscriptRequestBody(councilMeetingId, cityId);
    return startTask('fixTranscript', requestBody, councilMeetingId, cityId, options);
};

/**
 * A later transcribe or fixTranscript run of the meeting has succeeded since
 * this task was requested. The result then describes a transcript that is gone
 * or has been corrected again: its text would put old wording back, and its
 * speaker hints name tags that no longer mean the same thing.
 */
async function isSuperseded(taskId: string): Promise<boolean> {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        select: { cityId: true, councilMeetingId: true, createdAt: true },
    });
    if (!task) {
        throw new Error('Task not found');
    }
    const laterRun = await prisma.taskStatus.findFirst({
        where: {
            cityId: task.cityId,
            councilMeetingId: task.councilMeetingId,
            status: 'succeeded',
            type: { in: ['transcribe', 'fixTranscript'] },
            createdAt: { gt: task.createdAt },
        },
        select: { id: true },
    });
    return laterRun !== null;
}

/**
 * Applies a fixTranscript result. It takes the task id and the result from its
 * caller and checks no session, so it lives here and not in a "use server" file:
 * only the task-server callback and the admin's reprocess, which authorize on
 * their own, may reach it.
 *
 * A superseded result is ignored whole, text and hints: reprocessing a stored
 * result can reach this with any old task of the meeting.
 */
export const handleFixTranscriptResult = async (taskId: string, result: FixTranscriptResult) => {
    if (await isSuperseded(taskId)) {
        console.log(`fixTranscript result of task ${taskId} ignored: a later transcribe or fixTranscript run supersedes it`);
        return;
    }

    const nonExistentIds: string[] = [];

    // Update each utterance with its fixed text
    for (const update of result.updateUtterances) {
        // First check if the utterance exists
        const utterance = await prisma.utterance.findUnique({
            where: { id: update.utteranceId }
        });

        if (!utterance) {
            nonExistentIds.push(update.utteranceId);
            continue;
        }

        // Update the utterance if it exists
        await prisma.utterance.update({
            where: { id: update.utteranceId },
            data: {
                text: update.text,
                uncertain: update.markUncertain,
                lastModifiedBy: 'task'
            }
        });

        await prisma.utteranceEdit.create({
            data: {
                utteranceId: update.utteranceId,
                beforeText: utterance.text,
                afterText: update.text,
                editedBy: 'task',
            }
        });
    }

    console.log(`Updated ${result.updateUtterances.length} utterances (${nonExistentIds.length} not found)`);

    if (nonExistentIds.length > 0) {
        console.warn(`Warning: The following utterance IDs were not found: ${nonExistentIds.join(', ')}`);
    }

    // Absent when the task ran no speaker identification (an older task server,
    // or the pass failed): the hints of an earlier run then stay as they are.
    // The text corrections above are committed one by one, so a failure here
    // must not fail the task: it would report corrected text as a failed run.
    if (result.speakerHints) {
        try {
            await applySpeakerHints(taskId, result.speakerHints);
        } catch (error) {
            console.error(`Failed to apply speaker hints of task ${taskId}; the text corrections stand:`, error);
        }
    }
};
