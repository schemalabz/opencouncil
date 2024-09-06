"use server";

import { PrismaClient } from '@prisma/client';
import { TaskUpdate } from '../apiTypes';
import { handleTranscribeResult } from './transcribe';

const prisma = new PrismaClient();

export const startTask = async (taskType: string, requestBody: any, councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    // Check for existing running task
    const existingTask = await prisma.taskStatus.findFirst({
        where: {
            councilMeetingId,
            cityId,
            type: taskType,
            status: { notIn: ['failed', 'succeeded'] }
        }
    });

    if (existingTask && !options.force) {
        throw new Error('A task of this type is already running for this council meeting');
    }

    // Create new task in database
    const newTask = await prisma.taskStatus.create({
        data: {
            type: taskType,
            status: 'pending',
            requestBody: JSON.stringify(requestBody),
            councilMeeting: { connect: { cityId_id: { cityId, id: councilMeetingId } } }
        }
    });

    // Prepare callback URL
    const callbackUrl = `${process.env.PUBLIC_URL}/api/cities/${cityId}/meetings/${councilMeetingId}/taskStatuses/${newTask.id}`;
    console.log(`Callback URL: ${callbackUrl}`);

    // Add callback URL to request body
    const fullRequestBody = { ...requestBody, callbackUrl };

    // Call the backend API
    let response;
    let error;
    try {
        console.log(`Calling ${process.env.TASK_API_URL}/${taskType}`);
        response = await fetch(`${process.env.TASK_API_URL}/${taskType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TASK_API_KEY}`,
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

        let body = null;
        if (response) {
            console.log(`Status: ${response.status}`);
            body = await response.json();
        }
        throw new Error(`Failed to start task: ${response?.statusText} (${body ? body.error : 'no response body'})`);
    }

    // Update task with full request body including callback URL
    await prisma.taskStatus.update({
        where: { id: newTask.id },
        data: { requestBody: JSON.stringify(fullRequestBody) }
    });

    return newTask;
}

export const handleTaskUpdate = async <T>(taskId: string, update: TaskUpdate<T>, processResult: (taskId: string, result: T) => Promise<void>) => {
    if (update.status === 'success') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'succeeded', responseBody: JSON.stringify(update.result) }
        });
        if (update.result) {
            try {
                await processResult(taskId, update.result);
            } catch (error) {
                console.error(`Error processing result for task ${taskId}: ${error}`);
                await prisma.taskStatus.update({
                    where: { id: taskId },
                    data: { status: 'failed' }
                });
            }
        } else {
            console.log(`No result for task ${taskId}`);
        }
    } else if (update.status === 'error') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'failed', requestBody: update.error }
        });
    } else if (update.status === 'processing') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'pending', stage: update.stage, percentComplete: update.progressPercent }
        });
    }
}

export const processTaskResponse = async (taskType: string, taskId: string) => {
    console.log(`Processing task response for task ${taskId} of type ${taskType}`);
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
    }
    await handleTranscribeResult(taskId, JSON.parse(task.responseBody!));
}
