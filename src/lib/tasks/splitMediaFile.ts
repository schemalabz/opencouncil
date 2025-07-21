"use server";

import { SplitMediaFileRequest, SplitMediaFileResult } from "../apiTypes";
import { withUserAuthorizedToEdit } from "../auth";
import { getCouncilMeeting } from "../db/meetings";
import { getPodcastSpec } from "../db/podcasts";
import prisma from "../db/prisma";
import { startTask } from "./tasks";

export async function requestSplitMediaFileForPodcast(podcastId: string) {
    const podcastSpec = await getPodcastSpec(podcastId);
    if (!podcastSpec) {
        throw new Error('Podcast spec not found');
    }

    const meeting = await getCouncilMeeting(podcastSpec.cityId, podcastSpec.councilMeetingId);
    if (!meeting) {
        throw new Error('Meeting not found');
    }


    await withUserAuthorizedToEdit({ councilMeetingId: meeting.id });

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
        url: meeting.audioUrl,
        type: 'audio',
        parts: audioParts,
    }

    return startTask('splitMediaFile', request, meeting.id, meeting.cityId);
}

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

    await withUserAuthorizedToEdit({ councilMeetingId: highlight.meeting.id });

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

    // Update either PodcastParts or Highlights based on which ID exists
    await prisma.$transaction(async (prisma) => {
        for (const part of response.parts) {
            // Try to find podcast part
            const podcastPart = await prisma.podcastPart.findUnique({
                where: { id: part.id }
            });

            if (podcastPart) {
                // Update podcast part
                await prisma.podcastPart.update({
                    where: { id: part.id },
                    data: {
                        audioSegmentUrl: part.url,
                        duration: part.duration,
                        startTimestamp: part.startTimestamp,
                        endTimestamp: part.endTimestamp,
                    },
                });
                console.log(`Updated podcast part ${part.id} for meeting ${councilMeeting.id}`);
            } else {
                // Try to find and update highlight
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
                    console.warn(`Could not find podcast part or highlight with ID ${part.id}`);
                }
            }
        }
    });
}