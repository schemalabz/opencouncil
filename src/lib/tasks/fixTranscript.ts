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
    // Update each utterance with its fixed text
    for (const update of result.updateUtterances) {
        await prisma.utterance.update({
            where: { id: update.utteranceId },
            data: {
                text: update.text,
                uncertain: update.markUncertain
            }
        });
    }
};
