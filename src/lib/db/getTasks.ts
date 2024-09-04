'use server'
import { PrismaClient, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

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
