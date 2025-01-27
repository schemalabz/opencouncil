"use server";
import { GeneratePodcastSpecRequest } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";
import { getSummarizeRequestBody } from "../db/utils";
import { PodcastPart } from "@prisma/client";
import { PodcastPart as ApiPodcastPart } from "../apiTypes";
import { withUserAuthorizedToEdit } from "../auth";

export async function requestGeneratePodcastSpec(cityId: string, councilMeetingId: string, subjects: {
    id: string;
    allocation: 'onlyMention' | 'skip' | number;
    allocatedMinutes: number;
}[], additionalInstructions?: string) {
    await withUserAuthorizedToEdit({ cityId });

    const baseBody = await getSummarizeRequestBody(councilMeetingId, cityId, []);

    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: councilMeetingId } },
        include: { subjects: true }
    });

    if (!meeting) {
        throw new Error('Meeting not found');
    }

    const subjectsWithDetails = await Promise.all(subjects.map(async (subject) => {
        const dbSubject = await prisma.subject.findUnique({
            where: { id: subject.id },
            include: {
                speakerSegments: { include: { speakerSegment: true } },
                highlights: { include: { highlightedUtterances: true } }
            }
        });

        if (!dbSubject) {
            throw new Error(`Subject with id ${subject.id} not found`);
        }

        return {
            name: dbSubject.name,
            description: dbSubject.description,
            speakerSegmentIds: dbSubject.speakerSegments.map(ss => ss.speakerSegment.id),
            highlightedUtteranceIds: dbSubject.highlights.flatMap(h => h.highlightedUtterances.map(hu => hu.utteranceId)),
            allocation: subject.allocation === 'onlyMention' || subject.allocation === 'skip'
                ? subject.allocation
                : 'full',
            allocatedMinutes: typeof subject.allocation === 'number' ? subject.allocation : 0
        };
    }));

    if (!meeting.audioUrl) {
        throw new Error('Meeting audio URL not found');
    }

    const body: Omit<GeneratePodcastSpecRequest, 'callbackUrl'> = {
        ...baseBody,
        subjects: subjectsWithDetails.map(subject => ({
            ...subject,
            allocation: subject.allocation === 'onlyMention' || subject.allocation === 'skip' || subject.allocation === 'full'
                ? subject.allocation
                : 'full',
            allocatedMinutes: typeof subject.allocatedMinutes === 'number' ? subject.allocatedMinutes : 0
        })),
        audioUrl: meeting.audioUrl,
        additionalInstructions: additionalInstructions
    };

    console.log('Requesting podcast spec for meeting', meeting.id);

    return startTask('generatePodcastSpec', body, councilMeetingId, cityId);
}

export async function handleGeneratePodcastSpecResult(taskId: string, response: any) {
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

    // Create the PodcastSpec
    const podcastSpec = await prisma.podcastSpec.create({
        data: {
            councilMeetingId: councilMeeting.id,
            cityId: councilMeeting.cityId,
            parts: {
                create: response.parts.map((part: ApiPodcastPart, index: number) => {
                    if (part.type === 'host') {
                        return {
                            type: 'HOST',
                            text: part.text,
                            index: index,
                        };
                    } else {
                        return {
                            type: 'AUDIO',
                            podcastPartAudioUtterances: {
                                create: part.utteranceIds.map(utteranceId => ({
                                    utterance: { connect: { id: utteranceId } }
                                }))
                            },
                            index: index,
                        };
                    }
                })
            }
        },
        include: {
            parts: {
                include: {
                    podcastPartAudioUtterances: true
                }
            }
        }
    });

    console.log(`Saved podcast spec for meeting ${councilMeeting.id}`);
}
