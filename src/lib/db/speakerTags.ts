"use server";
import { SpeakerTag, Person } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';

export async function getSpeakerTag(id: string): Promise<(SpeakerTag & { person: Person | null }) | null> {
    const speakerTag = await prisma.speakerTag.findUnique({
        where: { id },
        include: {
            person: true,
            speakerSegments: true,
        }
    });
    return speakerTag;
}

export async function updateSpeakerTag(id: string, data: Partial<Omit<SpeakerTag, 'id' | 'createdAt' | 'updatedAt'>>): Promise<SpeakerTag> {
    const speakerTag = await prisma.speakerTag.findFirst({
        where: { id },
        include: {
            speakerSegments: {
                take: 1,
            }
        }
    });

    if (!speakerTag || !speakerTag.speakerSegments[0]) {
        throw new Error('Speaker tag not found');
    }

    await withUserAuthorizedToEdit({ cityId: speakerTag.speakerSegments[0].cityId });
    const updatedSpeakerTag = await prisma.speakerTag.update({
        where: { id },
        data,
    });
    return updatedSpeakerTag;
}

export async function getSpeakerTagsForCityCouncilMeeting(cityCouncilMeetingId: string): Promise<SpeakerTag[]> {
    const speakerTags = await prisma.speakerTag.findMany({
        where: {
            speakerSegments: {
                some: {
                    meetingId: cityCouncilMeetingId
                }
            }
        },
        orderBy: {
            createdAt: 'asc',
        },
    });
    return speakerTags;
}

export async function assignSpeakerSegmentToNewSpeakerTag(speakerSegmentId: string) {
    const speakerSegment = await prisma.speakerSegment.findUnique({
        where: { id: speakerSegmentId },
        include: { speakerTag: true }
    });

    if (!speakerSegment) {
        throw new Error('Speaker segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: speakerSegment.cityId });

    const newSpeakerTag = await prisma.speakerTag.create({
        data: {
            label: "New " + speakerSegment.speakerTag.label,
            speakerSegments: {
                connect: { id: speakerSegmentId }
            }
        }
    });

    await prisma.speakerSegment.update({
        where: { id: speakerSegmentId },
        data: { speakerTagId: newSpeakerTag.id }
    });

    return newSpeakerTag;
}

export async function createEmptySpeakerSegmentAfter(
    afterSegmentId: string,
    speakerTagId: string,
    cityId: string,
    meetingId: string
) {
    // First get the segment we're inserting after to get its end timestamp
    const afterSegment = await prisma.speakerSegment.findUnique({
        where: { id: afterSegmentId },
        include: { utterances: true }
    });

    if (!afterSegment) {
        throw new Error('Segment not found');
    }

    // Create a new segment starting at the end of the previous one
    // We'll create it with a 10 second duration initially
    const startTimestamp = afterSegment.endTimestamp;
    const endTimestamp = startTimestamp + 10;

    // Create the new segment
    const newSegment = await prisma.speakerSegment.create({
        data: {
            startTimestamp,
            endTimestamp,
            cityId,
            meetingId,
            speakerTagId,
            // Create an initial empty utterance
            utterances: {
                create: {
                    startTimestamp,
                    endTimestamp,
                    text: '',
                    lastModifiedBy: 'user'
                }
            }
        },
        include: {
            utterances: true,
            speakerTag: {
                include: {
                    person: {
                        include: {
                            roles: {
                                include: {
                                    party: true
                                }
                            }
                        }
                    }
                }
            },
            summary: true,
            topicLabels: {
                include: {
                    topic: true
                }
            }
        }
    });

    return newSegment;
}