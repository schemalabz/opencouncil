"use server";

import prisma from '@/lib/db/prisma';
import { FixTranscriptResult } from '../apiTypes';
import { getRequestOnTranscriptRequestBody } from '../db/utils';

export const requestFixTranscript = async (councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    let requestBody = await getRequestOnTranscriptRequestBody(councilMeetingId, cityId);

    // Start the task
    const { startTask } = await import('./tasks');
    return startTask('fixTranscript', requestBody, councilMeetingId, cityId, options);
};

export const handleFixTranscriptResult = async (taskId: string, result: FixTranscriptResult) => {
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
    }

    console.log(`Updated ${result.updateUtterances.length} utterances (${nonExistentIds.length} not found)`);

    if (nonExistentIds.length > 0) {
        console.warn(`Warning: The following utterance IDs were not found: ${nonExistentIds.join(', ')}`);
    }
};
