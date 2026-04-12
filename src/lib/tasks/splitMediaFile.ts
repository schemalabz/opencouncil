"use server";

import { SplitMediaFileRequest, SplitMediaFileResult } from "../apiTypes";
import { withUserAuthorizedToEdit } from "../auth";
import prisma from "../db/prisma";
import { startTask } from "./tasks";

export async function requestSplitMediaFileForHighlight(highlightId: string) {
    const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        include: {
            meeting: true,
            highlightedUtterances: {
                include: {
                    utterance: true
                }
            }
        }
    });

    if (!highlight) {
        throw new Error('Highlight not found');
    }

    await withUserAuthorizedToEdit({ cityId: highlight.cityId, councilMeetingId: highlight.meeting.id });

    if (!highlight.meeting.videoUrl) {
        throw new Error('Meeting video URL not found');
    }

    const segments = highlight.highlightedUtterances.map(hu => ({
        startTimestamp: hu.utterance.startTimestamp,
        endTimestamp: hu.utterance.endTimestamp
    })).sort((a, b) => a.startTimestamp - b.startTimestamp);

    const request: Omit<SplitMediaFileRequest, 'callbackUrl'> = {
        url: highlight.meeting.videoUrl,
        type: 'video',
        parts: [{
            id: highlight.id,
            segments
        }]
    };

    return startTask('splitMediaFile', request, highlight.meeting.id, highlight.cityId);
}

export async function handleSplitMediaFileResult(taskId: string, response: SplitMediaFileResult) {
    console.log('handleSplitMediaFileResult', taskId, response);
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        include: { councilMeeting: true }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    const { councilMeeting } = task;

    // Validate the response
    if (!Array.isArray(response.parts)) {
        throw new Error('Invalid response format: parts should be an array');
    }

    await prisma.$transaction(async (prisma) => {
        for (const part of response.parts) {
            const highlight = await prisma.highlight.findUnique({
                where: { id: part.id }
            });

            if (highlight) {
                await prisma.highlight.update({
                    where: { id: part.id },
                    data: {
                        videoUrl: part.url,
                        ...(part.muxPlaybackId && { muxPlaybackId: part.muxPlaybackId })
                    }
                });
                console.log(`Updated highlight ${part.id} for meeting ${councilMeeting.id}`);
            } else {
                console.warn(`Could not find highlight with ID ${part.id}`);
            }
        }
    });
}