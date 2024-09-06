"use server";
import { PrismaClient, SpeakerTag, Person } from '@prisma/client';

const prisma = new PrismaClient();

export async function getSpeakerTag(id: string): Promise<(SpeakerTag & { person: Person | null }) | null> {
    try {
        const speakerTag = await prisma.speakerTag.findUnique({
            where: { id },
            include: {
                person: true,
            }
        });
        return speakerTag;
    } catch (error) {
        console.error('Error fetching speaker tag:', error);
        throw new Error('Failed to fetch speaker tag');
    }
}

export async function updateSpeakerTag(id: string, data: Partial<Omit<SpeakerTag, 'id' | 'createdAt' | 'updatedAt'>>): Promise<SpeakerTag> {
    try {
        const updatedSpeakerTag = await prisma.speakerTag.update({
            where: { id },
            data,
        });
        return updatedSpeakerTag;
    } catch (error) {
        console.error('Error updating speaker tag:', error);
        throw new Error('Failed to update speaker tag');
    }
}
export async function getSpeakerTagsForCityCouncilMeeting(cityCouncilMeetingId: string): Promise<SpeakerTag[]> {
    try {
        const speakerTags = await prisma.speakerTag.findMany({
            where: {
                utterances: {
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
    } catch (error) {
        console.error('Error fetching speaker tags for city council meeting:', error);
        throw new Error('Failed to fetch speaker tags for city council meeting');
    }
}
