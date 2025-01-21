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
        try {
            await prisma.utterance.update({
                where: { id: update.utteranceId },
                data: {
                    text: update.text,
                    uncertain: update.markUncertain
                }
            });
        } catch (error) {
            // If the error is due to record not found
            if (error instanceof Error && error.message.includes('Record to update not found')) {
                nonExistentIds.push(update.utteranceId);
            } else {
                throw error; // Re-throw other errors
            }
        }
    }

    if (nonExistentIds.length > 0) {
        console.warn(`Warning: The following utterance IDs were not found: ${nonExistentIds.join(', ')}`);
    }
};
