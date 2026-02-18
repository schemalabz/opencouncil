"use server";

import { TaskUpdate } from '../apiTypes';
import prisma from '@/lib/db/prisma';
import { MeetingTaskType, TASK_CONFIG } from '@/lib/tasks/types';
import { withUserAuthorizedToEdit } from '../auth';
import { env } from '@/env.mjs';
import { sendTaskStartedAdminAlert, sendTaskCompletedAdminAlert, sendTaskFailedAdminAlert } from '@/lib/discord';
import { Prisma, TaskStatus } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { taskHandlers } from './registry';

export interface TaskIdempotencyResult {
    proceed: boolean;
    existingTask: TaskStatus | null;
    blockedReason?: 'already_succeeded' | 'already_running';
}

export async function checkTaskIdempotency(
    taskType: MeetingTaskType,
    cityId: string,
    councilMeetingId: string,
    options: { force?: boolean } = {}
): Promise<TaskIdempotencyResult> {
    if (options.force) {
        return { proceed: true, existingTask: null };
    }

    // Check for already-succeeded task
    const succeededTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId,
            cityId,
            type: taskType,
            status: 'succeeded',
        },
        orderBy: { createdAt: 'desc' },
    });

    if (succeededTask) {
        return { proceed: false, existingTask: succeededTask, blockedReason: 'already_succeeded' };
    }

    // Check for currently running task
    const runningTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId,
            cityId,
            type: taskType,
            status: { notIn: ['failed', 'succeeded'] },
        },
    });

    if (runningTask) {
        return { proceed: false, existingTask: runningTask, blockedReason: 'already_running' };
    }

    return { proceed: true, existingTask: null };
}

export interface TaskVersionsFilter {
    taskTypes: MeetingTaskType[];
    dateFrom?: Date;
    dateTo?: Date;
    cityIds?: string[];
    versionMin?: number;
    versionMax?: number;
}

const taskStatusWithMeetingInclude = {
    councilMeeting: {
        select: {
            name_en: true,
            city: {
                select: {
                    name_en: true
                }
            }
        }
    }
} satisfies Prisma.TaskStatusInclude;

export const startTask = async (taskType: MeetingTaskType, requestBody: any, councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    // Only enforce idempotency for core pipeline tasks — non-pipeline tasks
    // (generateHighlight, splitMediaFile, etc.) can legitimately run multiple times
    if (TASK_CONFIG[taskType].requiredForPipeline) {
        const idempotency = await checkTaskIdempotency(taskType, cityId, councilMeetingId, options);
        if (!idempotency.proceed) {
            throw new Error(
                idempotency.blockedReason === 'already_succeeded'
                    ? `A ${taskType} task has already succeeded for this council meeting`
                    : `A ${taskType} task is already running for this council meeting`
            );
        }
    }

    // Create new task in database
    const newTask = await prisma.taskStatus.create({
        data: {
            type: taskType,
            status: 'pending',
            requestBody: JSON.stringify(requestBody),
            councilMeeting: { connect: { cityId_id: { cityId, id: councilMeetingId } } }
        },
        include: taskStatusWithMeetingInclude
    });

    // Prepare callback URL
    const callbackUrl = `${env.NEXTAUTH_URL}/api/cities/${cityId}/meetings/${councilMeetingId}/taskStatuses/${newTask.id}`;
    console.log(`Callback URL: ${callbackUrl}`);

    // Add callback URL to request body
    const fullRequestBody = { ...requestBody, callbackUrl };

    // Call the backend API
    let response;
    let error;
    try {
        console.log(`Calling ${env.TASK_API_URL}/${taskType} with body ${JSON.stringify(fullRequestBody)}`);
        response = await fetch(`${env.TASK_API_URL}/${taskType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.TASK_API_KEY}`,
            },
            body: JSON.stringify(fullRequestBody),
        });
    } catch (err) {
        error = err;
        console.error('Error starting task:', error);
    }


    if (error || !response || !response.ok) {
        // Update task status to failed if API call fails
        await prisma.taskStatus.update({
            where: { id: newTask.id },
            data: { status: 'failed' }
        });

        let errorMessage = 'no response body';
        if (response) {
            console.log(`Status: ${response.status}`);
            const responseText = await response.text();
            try {
                const body = JSON.parse(responseText);
                errorMessage = body.error || responseText;
            } catch (e) {
                errorMessage = responseText;
            }
        } else if (error) {
            errorMessage = (error as Error).message;
        }

        throw new Error(`Failed to start task: ${response?.statusText} (${errorMessage})`);
    }

    // Update task with full request body including callback URL
    await prisma.taskStatus.update({
        where: { id: newTask.id },
        data: { requestBody: JSON.stringify(fullRequestBody) }
    });

    // Send Discord admin alert
    sendTaskStartedAdminAlert({
        taskType: taskType,
        cityName: newTask.councilMeeting.city.name_en,
        meetingName: newTask.councilMeeting.name_en,
        taskId: newTask.id,
        cityId: cityId,
        meetingId: councilMeetingId,
    });

    return newTask;
}

export const handleTaskUpdate = async <T>(taskId: string, update: TaskUpdate<T>, processResult: (taskId: string, result: T, options?: { force?: boolean }) => Promise<void>, options?: { force?: boolean }) => {
    // Get task details for Discord admin alerts
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        include: taskStatusWithMeetingInclude
    });

    if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
    }

    if (update.status === 'success') {
        const updatedTask = await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'succeeded', responseBody: JSON.stringify(update.result), version: update.version }
        });

        if (update.result) {
            try {
                await processResult(taskId, update.result, options);

                // Send Discord admin alert for successful completion AFTER processing succeeds
                sendTaskCompletedAdminAlert({
                    taskType: task.type,
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: task.councilMeeting.name_en,
                    taskId: task.id,
                    cityId: task.cityId,
                    meetingId: task.councilMeetingId,
                });
                
                // Revalidate cache only for successful tasks that affect meeting data
                if (updatedTask.cityId && shouldRevalidateForTaskType(updatedTask.type as MeetingTaskType)) {
                    try {
                        revalidateTag(`city:${updatedTask.cityId}:meetings`);
                    } catch (revalidateError) {
                        console.error(`Error revalidating cache for task ${taskId}:`, revalidateError);
                    }
                }
            } catch (error) {
                console.error(`Error processing result for task ${taskId}:`, error);
                await prisma.taskStatus.update({
                    where: { id: taskId },
                    data: { status: 'failed', version: update.version }
                });

                // Send Discord admin alert for processing failure
                sendTaskFailedAdminAlert({
                    taskType: task.type,
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: task.councilMeeting.name_en,
                    taskId: task.id,
                    cityId: task.cityId,
                    meetingId: task.councilMeetingId,
                    error: (error as Error).message,
                });
            }
        } else {
            console.log(`No result for task ${taskId}`);

            // Task succeeded but has no result to process - still send completion admin alert
            sendTaskCompletedAdminAlert({
                taskType: task.type,
                cityName: task.councilMeeting.city.name_en,
                meetingName: task.councilMeeting.name_en,
                taskId: task.id,
                cityId: task.cityId,
                meetingId: task.councilMeetingId,
            });
        }
    } else if (update.status === 'error') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'failed', responseBody: update.error, version: update.version }
        });

        // Send Discord admin alert for task failure
        sendTaskFailedAdminAlert({
            taskType: task.type,
            cityName: task.councilMeeting.city.name_en,
            meetingName: task.councilMeeting.name_en,
            taskId: task.id,
            cityId: task.cityId,
            meetingId: task.councilMeetingId,
            error: update.error,
        });
    } else if (update.status === 'processing') {
        // Use updateMany with WHERE clause to atomically prevent overwriting terminal states
        await prisma.taskStatus.updateMany({
            where: { 
                id: taskId,
                status: { notIn: ['succeeded', 'failed'] }
            },
            data: { status: 'pending', stage: update.stage, percentComplete: update.progressPercent, version: update.version }
        });
    }
}

// Helper function to determine which task types should trigger cache revalidation
function shouldRevalidateForTaskType(taskType: MeetingTaskType): boolean {
    // Only revalidate for tasks that affect meeting data that would be displayed in lists
    const revalidationTaskTypes = [
        'summarize', 
        'processAgenda',
    ];
    return revalidationTaskTypes.includes(taskType);
}

export const processTaskResponse = async (taskType: string, taskId: string, options?: { force?: boolean }) => {
    console.log(`Processing task response for task ${taskId} of type ${taskType}${options?.force ? ' (force mode)' : ''}`);
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) {
        throw new Error(`Task ${taskId} not found`);
    }

    const handler = taskHandlers[taskType];
    if (!handler) {
        throw new Error(`Unsupported task type: ${taskType}`);
    }

    await handler(taskId, JSON.parse(task.responseBody!), options);
}

export const getHighestVersionsForTasks = async (taskTypes: MeetingTaskType[]): Promise<Record<string, number | null>> => {
    await withUserAuthorizedToEdit({});
    const tasks = await prisma.taskStatus.findMany({
        select: {
            type: true,
            version: true
        },
        where: { type: { in: taskTypes } },
        orderBy: { version: 'desc' },
    });

    const highestVersions: Record<string, number | null> = {};

    // Initialize all task types with null version
    taskTypes.forEach(type => {
        highestVersions[type] = null;
    });

    // Update with highest version found for each type
    tasks.forEach(task => {
        if (highestVersions[task.type] === null || (task.version !== null && task.version > (highestVersions[task.type] ?? 0))) {
            highestVersions[task.type] = task.version;
        }
    });

    return highestVersions;
}

export const getTaskVersionsForMeetings = async (filters: TaskVersionsFilter): Promise<Record<string, any>[]> => {
    await withUserAuthorizedToEdit({});

    // Build meeting where clause
    const meetingWhere: Prisma.CouncilMeetingWhereInput = {
        city: {
            status: { not: 'pending' }
        }
    };

    if (filters.dateFrom || filters.dateTo) {
        meetingWhere.dateTime = {};
        if (filters.dateFrom) {
            meetingWhere.dateTime.gte = filters.dateFrom;
        }
        if (filters.dateTo) {
            meetingWhere.dateTime.lte = filters.dateTo;
        }
    }

    if (filters.cityIds && filters.cityIds.length > 0) {
        meetingWhere.cityId = { in: filters.cityIds };
    }

    // Build task status where clause
    const taskStatusWhere: Prisma.TaskStatusWhereInput = {
        type: { in: filters.taskTypes },
        status: "succeeded"
    };

    if (filters.versionMin !== undefined || filters.versionMax !== undefined) {
        taskStatusWhere.version = {};
        if (filters.versionMin !== undefined) {
            taskStatusWhere.version.gte = filters.versionMin;
        }
        if (filters.versionMax !== undefined) {
            taskStatusWhere.version.lte = filters.versionMax;
        }
    }

    const meetings = await prisma.councilMeeting.findMany({
        select: {
            id: true,
            cityId: true,
            dateTime: true,
            taskStatuses: {
                where: taskStatusWhere,
                select: {
                    type: true,
                    version: true
                },
                orderBy: {
                    version: 'desc'
                }
            }
        },
        where: meetingWhere,
        orderBy: { dateTime: 'desc' }
    });

    // Transform into desired format
    return meetings.map(meeting => {
        const result: Record<string, any> = {
            cityId: meeting.cityId,
            meetingId: meeting.id,
            dateTime: meeting.dateTime
        };

        // Add version for each task type
        filters.taskTypes.forEach(taskType => {
            const taskStatus = meeting.taskStatuses.find(t => t.type === taskType);
            result[taskType] = taskStatus?.version ?? null;
        });

        return result;
    });
};

export const getTaskVersionsGroupedByCity = async (filters: TaskVersionsFilter): Promise<Record<string, any>> => {
    await withUserAuthorizedToEdit({});

    // Get all meetings with their task versions
    const meetingsWithVersions = await getTaskVersionsForMeetings(filters);

    // Build city where clause
    const cityWhere: Prisma.CityWhereInput = {
        status: { not: 'pending' }
    };

    if (filters.cityIds && filters.cityIds.length > 0) {
        cityWhere.id = { in: filters.cityIds };
    }

    // Get city information
    const cities = await prisma.city.findMany({
        where: cityWhere,
        select: {
            id: true,
            name: true,
            name_en: true
        }
    });

    // Group by city
    const groupedByCity: Record<string, any> = {};

    // Initialize with empty arrays for each city
    cities.forEach(city => {
        groupedByCity[city.id] = {
            cityId: city.id,
            cityName: city.name,
            cityNameEn: city.name_en,
            meetings: [],
            meetingCount: 0
        };
    });

    // Add meetings to their respective cities
    meetingsWithVersions.forEach(meeting => {
        const cityId = meeting.cityId;
        if (groupedByCity[cityId]) {
            groupedByCity[cityId].meetings.push(meeting);
            groupedByCity[cityId].meetingCount++;
        }
    });

    return groupedByCity;
};

export const getAvailableCities = async (): Promise<{ id: string; name: string; name_en: string }[]> => {
    await withUserAuthorizedToEdit({});
    return prisma.city.findMany({
        where: { status: { not: 'pending' } },
        select: { id: true, name: true, name_en: true },
        orderBy: { name_en: 'asc' }
    });
};