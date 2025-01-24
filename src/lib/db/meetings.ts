"use server";
import { CouncilMeeting, TaskStatus } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';

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

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl' | 'agendaUrl'> & { audioUrl?: string, videoUrl?: string, agendaUrl?: string }): Promise<CouncilMeeting> {
    withUserAuthorizedToEdit({ cityId: meetingData.cityId });
    try {
        const newMeeting = await prisma.councilMeeting.create({
            data: meetingData,
        });
        return newMeeting;
    } catch (error) {
        console.error('Error creating council meeting:', error);
        throw new Error('Failed to create council meeting');
    }
}

export async function editCouncilMeeting(cityId: string, id: string, meetingData: Partial<Omit<CouncilMeeting, 'id' | 'cityId' | 'createdAt' | 'updatedAt'>>): Promise<CouncilMeeting> {
    withUserAuthorizedToEdit({ councilMeetingId: id });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: meetingData,
        });
        return updatedMeeting;
    } catch (error) {
        console.error('Error editing council meeting:', error);
        throw new Error('Failed to edit council meeting');
    }
}

export async function getCouncilMeeting(cityId: string, id: string): Promise<CouncilMeeting | null> {
    const startTime = performance.now();
    try {
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
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

export async function getCouncilMeetingsForCity(cityId: string, { includeUnreleased }: { includeUnreleased: boolean } = { includeUnreleased: false }): Promise<CouncilMeeting[]> {
    if (includeUnreleased) {
        withUserAuthorizedToEdit({ cityId });
    }

    try {
        const meetings = await prisma.councilMeeting.findMany({
            where: { cityId, released: includeUnreleased ? undefined : true },
            orderBy: { dateTime: 'desc' },
        });
        return meetings;
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

export async function toggleMeetingRelease(cityId: string, id: string, released: boolean): Promise<CouncilMeeting> {
    withUserAuthorizedToEdit({ councilMeetingId: id });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: { released },
        });
        return updatedMeeting;
    } catch (error) {
        console.error('Error toggling council meeting release:', error);
        throw new Error('Failed to toggle council meeting release');
    }
}
