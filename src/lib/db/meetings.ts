"use server";
import { CouncilMeeting, Subject, AdministrativeBody } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';

type CouncilMeetingWithAdminBody = CouncilMeeting & {
    administrativeBody: AdministrativeBody | null
}

export type CouncilMeetingWithAdminBodyAndSubjects = CouncilMeetingWithAdminBody & {
    subjects: Subject[]
}

export async function deleteCouncilMeeting(cityId: string, id: string): Promise<void> {
    withUserAuthorizedToEdit({ councilMeetingId: id });
    try {
        await prisma.councilMeeting.delete({
            where: { cityId_id: { cityId, id } },
        });
    } catch (error) {
        console.error('Error deleting council meeting:', error);
        throw new Error('Failed to delete council meeting');
    }
}

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl'> & { audioUrl?: string, videoUrl?: string }): Promise<CouncilMeetingWithAdminBody> {
    withUserAuthorizedToEdit({ cityId: meetingData.cityId });
    try {
        const newMeeting = await prisma.councilMeeting.create({
            data: meetingData,
            include: {
                administrativeBody: true
            }
        });
        return newMeeting;
    } catch (error) {
        console.error('Error creating council meeting:', error);
        throw new Error('Failed to create council meeting');
    }
}

export async function editCouncilMeeting(cityId: string, id: string, meetingData: Partial<Omit<CouncilMeeting, 'id' | 'cityId' | 'createdAt' | 'updatedAt'>>): Promise<CouncilMeetingWithAdminBody> {
    withUserAuthorizedToEdit({ councilMeetingId: id });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: meetingData,
            include: {
                administrativeBody: true
            }
        });
        return updatedMeeting;
    } catch (error) {
        console.error('Error editing council meeting:', error);
        throw new Error('Failed to edit council meeting');
    }
}

export async function getCouncilMeeting(cityId: string, id: string): Promise<CouncilMeetingWithAdminBody | null> {
    const startTime = performance.now();
    try {
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
            include: {
                administrativeBody: true
            }
        });
        const endTime = performance.now();

        if (meeting && !meeting.released && !withUserAuthorizedToEdit({ cityId })) {
            return null;
        }
        return meeting;
    } catch (error) {
        console.error('Error fetching council meeting:', error);
        throw new Error('Failed to fetch council meeting');
    }
}

export async function getCouncilMeetingsForCity(cityId: string, { includeUnreleased }: { includeUnreleased: boolean } = { includeUnreleased: false }): Promise<CouncilMeetingWithAdminBodyAndSubjects[]> {
    console.log(`[${new Date().toISOString()}] getCouncilMeetingsForCity: ${cityId} (includeUnreleased: ${includeUnreleased})`);

    try {
        const meetings = await prisma.councilMeeting.findMany({
            where: { cityId, released: includeUnreleased ? undefined : true },
            orderBy: [
                { dateTime: 'desc' },
                { createdAt: 'desc' }
            ],
            include: {
                subjects: true,
                administrativeBody: true
            }
        });
        return meetings;
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

export async function toggleMeetingRelease(cityId: string, id: string, released: boolean): Promise<CouncilMeetingWithAdminBody> {
    withUserAuthorizedToEdit({ councilMeetingId: id });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: { released },
            include: {
                administrativeBody: true
            }
        });
        return updatedMeeting;
    } catch (error) {
        console.error('Error toggling council meeting release:', error);
        throw new Error('Failed to toggle council meeting release');
    }
}

export async function getCouncilMeetingsCountForCity(cityId: string): Promise<number> {
    console.log(`[${new Date().toISOString()}] getCouncilMeetingsCountForCity: ${cityId}`);
    try {
        const count = await prisma.councilMeeting.count({
            where: {
                cityId,
                released: true
            }
        });
        return count;
    } catch (error) {
        console.error('Error counting council meetings for city:', error);
        throw new Error('Failed to count council meetings for city');
    }
}

export async function getMeetingDataForOG(cityId: string, meetingId: string) {
    try {
        const data = await prisma.councilMeeting.findUnique({
            where: {
                cityId_id: { cityId, id: meetingId },
                released: true
            },
            select: {
                name: true,
                dateTime: true,
                subjects: {
                    select: {
                        id: true,
                        name: true,
                        hot: true,
                        topic: {
                            select: {
                                colorHex: true
                            }
                        }
                    }
                },
                city: {
                    select: {
                        name_municipality: true,
                        logoImage: true
                    }
                }
            }
        });

        if (!data) return null;
        return data;
    } catch (error) {
        console.error('Error fetching meeting data for OG:', error);
        throw new Error('Failed to fetch meeting data for OG');
    }
}
