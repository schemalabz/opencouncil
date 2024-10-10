"use server";

import { SplitMediaFileRequest, SplitMediaFileResult } from "../apiTypes";
import { getCouncilMeeting } from "../db/meetings";
import { getPodcastSpec } from "../db/podcasts";
import prisma from "../db/prisma";
import { startTask } from "./tasks";

export async function reqeustSplitMediaFile(podcastId: string) {
    const podcastSpec = await getPodcastSpec(podcastId);
    if (!podcastSpec) {
        throw new Error('Podcast spec not found');
    }

    const meeting = await getCouncilMeeting(podcastSpec.cityId, podcastSpec.councilMeetingId);
    if (!meeting) {
        throw new Error('Meeting not found');
    }

    if (!meeting.audioUrl) {
        throw new Error('Meeting audio URL not found');
    }

    const audioParts = podcastSpec.parts.filter(part => part.type === 'AUDIO').map((podcastPart) => {
        return {
            id: podcastPart.id,
            segments: podcastPart.podcastPartAudioUtterances.map((podcastPartAudioUtterance) => {
                return {
                    startTimestamp: podcastPartAudioUtterance.utterance.startTimestamp,
                    endTimestamp: podcastPartAudioUtterance.utterance.endTimestamp,
                }
            }).sort((a, b) => a.startTimestamp - b.startTimestamp)
        }
    });

    const request: Omit<SplitMediaFileRequest, 'callbackUrl'> = {
        audioUrl: meeting.audioUrl,
        parts: audioParts,
    }

    return startTask('splitMediaFile', request, meeting.id, meeting.cityId);
}
export async function handleSplitMediaFileResult(taskId: string, response: SplitMediaFileResult) {
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

    // Update PodcastParts
    await prisma.$transaction(async (prisma) => {
        for (const part of response.parts) {
            await prisma.podcastPart.update({
                where: { id: part.id },
                data: {
                    audioSegmentUrl: part.audioUrl,
                    duration: part.duration,
                    startTimestamp: part.startTimestamp,
                    endTimestamp: part.endTimestamp,
                },
            });
        }
    });

    console.log(`Updated podcast parts for meeting ${councilMeeting.id}`);
}