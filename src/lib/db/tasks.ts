'use server'
import prisma from "./prisma";
import { TaskStatus } from '@prisma/client';

export async function getTasksForMeeting(cityId: string, meetingId: string): Promise<TaskStatus[]> {
    try {
        const tasks = await prisma.taskStatus.findMany({
            where: {
                cityId: cityId,
                councilMeetingId: meetingId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return tasks;
    } catch (error) {
        console.error('Error fetching tasks:', error);
        throw new Error('Failed to fetch tasks');
    }
}
