'use server'
import { withUserAuthorizedToEdit } from "../auth";
import prisma from "./prisma";
import { TaskStatus } from '@prisma/client';

export async function getTasksForMeeting(cityId: string, meetingId: string): Promise<TaskStatus[]> {
    await withUserAuthorizedToEdit({ councilMeetingId: meetingId, cityId: cityId })
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

export async function getTaskStatus(taskStatusId: string): Promise<TaskStatus | null> {
    try {
        const taskStatus = await prisma.taskStatus.findUnique({
            where: { id: taskStatusId },
        });

        return taskStatus;
    } catch (error) {
        console.error('Error fetching task status:', error);
        throw new Error('Failed to fetch task status');
    }
}

export async function deleteTaskStatus(taskStatusId: string): Promise<void> {
    try {
        await prisma.taskStatus.delete({
            where: { id: taskStatusId },
        });
    } catch (error) {
        console.error('Error deleting task status:', error);
        throw new Error('Failed to delete task status');
    }
}

/**
 * Get generateHighlight tasks for a specific highlight within a meeting
 */
export async function getGenerateHighlightTasksForHighlight(cityId: string, meetingId: string, highlightId: string): Promise<TaskStatus[]> {
    await withUserAuthorizedToEdit({ councilMeetingId: meetingId, cityId });
    try {
        const tasks = await prisma.taskStatus.findMany({
            where: {
                type: 'generateHighlight',
                cityId,
                councilMeetingId: meetingId,
            },
            orderBy: { createdAt: 'desc' },
        });
        // Filter tasks that contain this highlightId in their requestBody.parts[0].id
        return tasks.filter(task => {
            try {
                const body = JSON.parse(task.requestBody) as { parts?: Array<{ id?: string }> };
                return body.parts && body.parts.length > 0 && body.parts[0].id === highlightId;
            } catch {
                return false;
            }
        });
    } catch (error) {
        console.error('Error fetching generateHighlight tasks:', error);
        throw new Error('Failed to fetch tasks for highlight');
    }
}

/**
 * Get voiceprint generation tasks for a specific person
 */
export async function getVoiceprintTasksForPerson(personId: string): Promise<TaskStatus[]> {
    try {
        const tasks = await prisma.taskStatus.findMany({
            where: {
                type: "generateVoiceprint",
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Filter tasks that contain this personId in their requestBody
        const personTasks = tasks.filter(task => {
            try {
                const requestBody = JSON.parse(task.requestBody);
                return requestBody.personId === personId;
            } catch {
                return false;
            }
        });

        return personTasks;
    } catch (error) {
        console.error('Error fetching voiceprint tasks:', error);
        throw new Error('Failed to fetch voiceprint tasks for person');
    }
}