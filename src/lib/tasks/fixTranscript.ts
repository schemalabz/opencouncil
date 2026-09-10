"use server";

import prisma from '@/lib/db/prisma';
import { FixTranscriptResult } from '../apiTypes';
import { withUserAuthorizedToEdit } from '../auth';
import { requestFixTranscriptInternal } from './fixTranscriptInternal';

/**
 * Browser-facing entry point for the admin panel's fix-transcript button.
 *
 * The city and meeting ids arrive from the caller, so this gate is what stops
 * one city's admin from queueing a transcript rewrite on another city's
 * meeting. Background callers have no session to gate on and use
 * requestFixTranscriptInternal.
 */
export const requestFixTranscript = async (councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    await withUserAuthorizedToEdit({ cityId });
    return requestFixTranscriptInternal(councilMeetingId, cityId, options);
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
};
