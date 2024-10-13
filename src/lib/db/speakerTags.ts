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

    withUserAuthorizedToEdit({ cityId: speakerTag.speakerSegments[0].cityId });
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

    withUserAuthorizedToEdit({ cityId: speakerSegment.cityId });

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