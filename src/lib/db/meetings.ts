"use server";
import { CouncilMeeting } from '@prisma/client';
import prisma from "./prisma";

export async function deleteCouncilMeeting(cityId: string, id: string): Promise<void> {
    try {
        await prisma.councilMeeting.delete({
            where: { cityId_id: { cityId, id } },
        });
    } catch (error) {
        console.error('Error deleting council meeting:', error);
        throw new Error('Failed to delete council meeting');
    }
}

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl'> & { audioUrl?: string, videoUrl?: string }): Promise<CouncilMeeting> {
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
    try {
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
        });
        return meeting;
    } catch (error) {
        console.error('Error fetching council meeting:', error);
        throw new Error('Failed to fetch council meeting');
    }
}

export async function getCouncilMeetingsForCity(cityId: string): Promise<CouncilMeeting[]> {
    try {
        const meetings = await prisma.councilMeeting.findMany({
            where: { cityId },
        });
        return meetings;
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}
